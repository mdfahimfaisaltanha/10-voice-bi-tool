import OpenAI from "openai"
import { schemaToPrompt, type TableSchema } from "@/lib/db"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

export type Nl2SqlResult = {
  /** Generated SQL, or null when clarification is needed. */
  sql: string | null
  /** One-sentence plain-language explanation of what the query computes. */
  explanation: string
  /** Set when the question is too ambiguous or unrelated to the schema. */
  clarification: string | null
}

const SYSTEM = `You are an expert PostgreSQL analyst. You translate business questions into a single read-only SQL query.

Rules:
- Output ONLY a JSON object: {"sql": string|null, "explanation": string, "clarification": string|null}
- One SELECT (or WITH ... SELECT) statement. NEVER any data-modifying or DDL statement.
- Use only tables/columns from the provided schema. Never invent columns.
- Prefer aggregations (GROUP BY) that directly answer the question; round monetary averages to 2 decimals.
- When grouping by month, use to_char(date_col, 'YYYY-MM') AS month and ORDER BY it.
- Give result columns clear snake_case aliases (e.g. total_revenue, order_count).
- Add ORDER BY for rankings and a sensible LIMIT (e.g. top 10) when the question implies one.
- If the question is ambiguous, unrelated to the schema, or asks to modify data: set sql to null and put a short helpful message in clarification (for data-modification requests, say this tool is read-only).
- explanation: one sentence describing what the query computes.`

function validate(data: unknown): Nl2SqlResult | null {
  if (typeof data !== "object" || data === null) return null
  const d = data as Record<string, unknown>
  const sql = typeof d.sql === "string" && d.sql.trim() !== "" ? d.sql.trim() : null
  const clarification =
    typeof d.clarification === "string" && d.clarification.trim() !== ""
      ? d.clarification.trim()
      : null
  if (sql === null && clarification === null) return null
  return {
    sql,
    explanation: typeof d.explanation === "string" ? d.explanation : "",
    clarification,
  }
}

export async function nlToSql(
  question: string,
  schema: TableSchema[],
): Promise<Nl2SqlResult> {
  const user = `DATABASE SCHEMA (PostgreSQL):\n${schemaToPrompt(schema)}\n\nQUESTION: ${question.slice(0, 1000)}`

  let lastError = ""
  for (let attempt = 0; attempt <= 1; attempt++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            attempt === 0
              ? user
              : `${user}\n\nYour previous output was invalid (${lastError}). Return ONLY the JSON object described in the instructions.`,
        },
      ],
    })
    const raw = res.choices[0]?.message?.content ?? ""
    try {
      const valid = validate(JSON.parse(raw))
      if (valid) return valid
      lastError = "JSON did not match the expected shape"
    } catch {
      lastError = "output was not parseable JSON"
    }
  }
  throw new Error("The AI model failed to produce a valid SQL translation. Try rephrasing your question.")
}
