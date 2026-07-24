"use client"

import { useEffect, useRef, useState } from "react"
import ChartView from "@/components/ChartView"
import type { QueryResponse } from "@/lib/types"

const SAMPLE_QUESTIONS = [
  "What was total revenue by month over the last year?",
  "Top 10 products by revenue",
  "Revenue share by product category",
  "Which cities have the most customers?",
  "What is the average order value?",
  "How many orders were refunded each month?",
]

export default function Home() {
  const [question, setQuestion] = useState("")
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clarification, setClarification] = useState<string | null>(null)
  const [blockedSql, setBlockedSql] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null)

  useEffect(() => {
    // Web Speech API is prefixed in Chrome; absent in some browsers -> we
    // detect support and gracefully fall back to typing.
    const w = window as unknown as Record<string, unknown>
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string
          interimResults: boolean
          maxAlternatives: number
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
          onend: () => void
          onerror: () => void
          start: () => void
          stop: () => void
          abort: () => void
        })
      | undefined
    if (!SR) return
    setVoiceSupported(true)
    const rec = new SR()
    rec.lang = "en-US"
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ""
      if (transcript) {
        setQuestion(transcript)
        void ask(transcript)
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    return () => rec.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      setListening(true)
      rec.start()
    }
  }

  async function ask(q?: string) {
    const text = (q ?? question).trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setClarification(null)
    setBlockedSql(null)
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult(null)
        if (data.clarification) setClarification(data.clarification)
        else setError(data.error || "Query failed.")
        if (data.sql) setBlockedSql(data.sql)
        return
      }
      setResult(data as QueryResponse)
      setHistory((prev) => [text, ...prev.filter((h) => h !== text)].slice(0, 8))
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : "Query failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>🎙️ Voice BI — ask your data anything</h1>
        <p>
          Speak or type a business question. It becomes a guarded, read-only SQL
          query against your Postgres database, and the answer picks its own
          best chart.
        </p>
      </div>

      <div className="ask-card">
        <div className="ask-row">
          {voiceSupported && (
            <button
              type="button"
              className={`mic ${listening ? "listening" : ""}`}
              onClick={toggleMic}
              title={listening ? "Stop listening" : "Ask by voice"}
            >
              {listening ? "⏹" : "🎤"}
            </button>
          )}
          <input
            value={question}
            placeholder={listening ? "Listening…" : "e.g. What was revenue by month last year?"}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button onClick={() => ask()} disabled={loading}>
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
        {!voiceSupported && (
          <p className="mic-hint">
            Voice input needs a browser with the Web Speech API (Chrome or Edge). Typing works everywhere.
          </p>
        )}
        <div className="chips">
          {SAMPLE_QUESTIONS.map((q) => (
            <button key={q} onClick={() => { setQuestion(q); void ask(q) }}>
              {q}
            </button>
          ))}
        </div>

        {error && <div className="error-box">⛔ {error}</div>}
        {clarification && <div className="clarify-box">🤔 {clarification}</div>}
        {blockedSql && (
          <details style={{ marginTop: 10 }}>
            <summary>Show the SQL that was blocked / failed</summary>
            <pre className="sql">{blockedSql}</pre>
          </details>
        )}
      </div>

      {result && (
        <div className="results">
          <div className="card">
            <h2>{result.question}</h2>
            <p className="sub">
              {result.explanation} · {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.elapsedMs} ms · chart: {result.chart.type} — {result.chart.reason}
            </p>
            <ChartView chart={result.chart} rows={result.rows} columns={result.columns} />
            {result.truncated && (
              <p className="truncated">
                ⚠️ Results were capped at 500 rows. Ask a more specific or aggregated question for complete answers.
              </p>
            )}
          </div>

          <div className="card">
            <details>
              <summary>Show generated SQL (every answer is fully transparent)</summary>
              <pre className="sql">{result.sql}</pre>
            </details>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card history" style={{ marginTop: 16 }}>
          <h2>Recent questions</h2>
          {history.map((h) => (
            <button key={h} onClick={() => { setQuestion(h); void ask(h) }}>
              ↩ {h}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
