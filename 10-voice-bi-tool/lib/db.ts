import { Pool } from "pg"

/**
 * Postgres pool with defense-in-depth hardening applied to EVERY connection:
 * - default_transaction_read_only = on  -> even if a write slipped past the
 *   SQL guard, Postgres itself refuses to execute it.
 * - statement_timeout = 10s             -> runaway analytical queries are
 *   killed by the server, protecting the pool.
 */
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local, point it at a Postgres database (Neon/Supabase free tiers work), then run `npm run seed`.",
      )
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    })
    pool.on("connect", (client) => {
      void client.query(
        "SET default_transaction_read_only = on; SET statement_timeout = '10s'",
      )
    })
  }
  return pool
}

/* ------------------------------------------------------------------ */
/* Schema introspection (cached)                                       */
/* ------------------------------------------------------------------ */

export type TableSchema = {
  table: string
  columns: { name: string; type: string }[]
}

let schemaCache: { schema: TableSchema[]; at: number } | null = null
const SCHEMA_TTL_MS = 5 * 60 * 1000

/**
 * Introspect public tables + columns from information_schema so the
 * NL-to-SQL prompt always reflects the real database — the tool is not
 * hard-coded to the demo dataset.
 */
export async function getSchema(): Promise<TableSchema[]> {
  if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) {
    return schemaCache.schema
  }
  const res = await getPool().query<{
    table_name: string
    column_name: string
    data_type: string
  }>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  )
  const byTable = new Map<string, TableSchema>()
  for (const row of res.rows) {
    if (!byTable.has(row.table_name)) {
      byTable.set(row.table_name, { table: row.table_name, columns: [] })
    }
    byTable.get(row.table_name)!.columns.push({
      name: row.column_name,
      type: row.data_type,
    })
  }
  const schema = [...byTable.values()]
  if (schema.length === 0) {
    throw new Error(
      "The connected database has no tables. Run `npm run seed` to load the demo dataset.",
    )
  }
  schemaCache = { schema, at: Date.now() }
  return schema
}

export function schemaToPrompt(schema: TableSchema[]): string {
  return schema
    .map(
      (t) =>
        `TABLE ${t.table} (\n${t.columns.map((c) => `  ${c.name} ${c.type}`).join(",\n")}\n)`,
    )
    .join("\n\n")
}
