import { NextResponse } from "next/server"
import { classifyColumns, selectChart } from "@/lib/chartSelect"
import { getPool, getSchema } from "@/lib/db"
import { nlToSql } from "@/lib/nl2sql"
import { guardSql, MAX_ROWS } from "@/lib/sqlGuard"
import type { QueryError, QueryResponse } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Normalize pg driver values for charting + JSON transport:
 * - NUMERIC / BIGINT come back as strings -> convert to number when safe
 * - Date objects -> ISO strings (dates only keep YYYY-MM-DD)
 */
function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
        const num = Number(value)
        out[key] = Number.isSafeInteger(num) || value.includes(".") ? num : value
      } else if (value instanceof Date) {
        const iso = value.toISOString()
        out[key] = iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso
      } else {
        out[key] = value
      }
    }
    return out
  })
}

export async function POST(req: Request) {
  const started = Date.now()
  try {
    const body = (await req.json()) as { question?: string }
    const question = (body.question ?? "").trim()

    if (!question) {
      return NextResponse.json<QueryError>({ error: "Ask a question first." }, { status: 400 })
    }
    if (question.length > 1000) {
      return NextResponse.json<QueryError>({ error: "Question too long (max 1000 characters)." }, { status: 400 })
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json<QueryError>(
        { error: "Server is missing OPENAI_API_KEY. Copy .env.example to .env.local and set your key." },
        { status: 500 },
      )
    }

    // 1. Live schema -> prompt (works against any Postgres DB, not just the demo)
    const schema = await getSchema()

    // 2. NL -> SQL
    const translated = await nlToSql(question, schema)

    // Edge case: ambiguous / unrelated / write-requests -> clarification, not a query
    if (!translated.sql) {
      return NextResponse.json<QueryError>(
        {
          error: "I need a better question to query the data.",
          clarification: translated.clarification ?? "Try being more specific about the metric and time range.",
        },
        { status: 422 },
      )
    }

    // 3. Guardrails (fail closed)
    const guarded = guardSql(translated.sql)
    if (!guarded.ok) {
      return NextResponse.json<QueryError>(
        { error: `Query blocked: ${guarded.reason}`, sql: translated.sql },
        { status: 403 },
      )
    }

    // 4. Execute (read-only session + 10s statement timeout, see lib/db.ts)
    let result
    try {
      result = await getPool().query(guarded.sql)
    } catch (dbErr) {
      const message = dbErr instanceof Error ? dbErr.message : "Query execution failed."
      return NextResponse.json<QueryError>(
        { error: `The generated SQL failed to execute: ${message}`, sql: translated.sql },
        { status: 422 },
      )
    }

    const truncated = result.rows.length > MAX_ROWS
    const rows = normalizeRows(result.rows.slice(0, MAX_ROWS))

    // 5. Auto chart selection from the result shape
    const columns = classifyColumns(rows)
    const chart = selectChart(rows, columns)

    const response: QueryResponse = {
      question,
      sql: translated.sql,
      explanation: translated.explanation,
      columns,
      rows,
      rowCount: rows.length,
      truncated,
      chart,
      elapsedMs: Date.now() - started,
    }
    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed unexpectedly."
    return NextResponse.json<QueryError>({ error: message }, { status: 500 })
  }
}
