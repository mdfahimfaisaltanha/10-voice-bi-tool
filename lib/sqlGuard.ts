/**
 * SELECT-only SQL guardrails.
 *
 * Strategy: fail closed. Layers:
 *   1. Strip comments; reject multi-statement input.
 *   2. Statement must start with SELECT or WITH.
 *   3. Whole-word blocklist of every data-modifying / privileged keyword,
 *      scanned OUTSIDE string literals (so a value like 'update notes' in a
 *      WHERE clause does not false-positive, but `WITH x AS (DELETE ...)` is
 *      caught).
 *   4. Result-size cap: the query is wrapped in a subquery with LIMIT.
 *   5. (Defense in depth, see lib/db.ts) every connection runs with
 *      default_transaction_read_only = on and a 10s statement_timeout, so
 *      Postgres itself is the final enforcement layer.
 */

const BLOCKED = [
  "insert", "update", "delete", "merge", "upsert",
  "drop", "alter", "create", "truncate", "rename",
  "grant", "revoke", "comment",
  "copy", "import", "install",
  "vacuum", "analyze", "cluster", "reindex", "refresh",
  "call", "do", "execute", "prepare", "deallocate",
  "set", "reset", "show", "listen", "notify", "unlisten",
  "lock", "checkpoint", "discard", "security",
  "pg_sleep", "pg_read_file", "pg_write_file", "pg_ls_dir",
  "pg_terminate_backend", "pg_cancel_backend", "lo_import", "lo_export",
  "dblink", "pg_catalog", "pg_shadow", "pg_authid",
]

export type GuardResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string }

export const MAX_ROWS = 500

/** Remove SQL comments (line + block). */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
}

/** Replace single-quoted string literals with placeholders for keyword scanning. */
function maskStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "'?'")
}

export function guardSql(rawSql: string): GuardResult {
  let sql = stripComments(rawSql).trim()

  // Drop a single trailing semicolon, then reject any remaining semicolons
  // (multi-statement injection).
  sql = sql.replace(/;\s*$/, "").trim()
  if (sql.length === 0) {
    return { ok: false, reason: "Empty SQL statement." }
  }
  if (sql.includes(";")) {
    return { ok: false, reason: "Multiple SQL statements are not allowed." }
  }

  // Must be a read query.
  if (!/^(select|with)\b/i.test(sql)) {
    return { ok: false, reason: "Only SELECT queries are allowed." }
  }

  // Whole-word keyword blocklist, scanned outside string literals.
  const masked = maskStringLiterals(sql).toLowerCase()
  for (const word of BLOCKED) {
    const re = new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`, "i")
    if (re.test(masked)) {
      return {
        ok: false,
        reason: `Blocked keyword "${word.toUpperCase()}" — this tool only runs read-only SELECT queries.`,
      }
    }
  }

  // Result-size cap: wrap in a subquery so LIMIT applies no matter what the
  // inner query does. +1 row lets the caller detect truncation.
  const capped = `SELECT * FROM (\n${sql}\n) AS guarded_q LIMIT ${MAX_ROWS + 1}`
  return { ok: true, sql: capped }
}
