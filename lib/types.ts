/** Shared types for the Voice BI tool. */

export type ColumnKind = "numeric" | "temporal" | "categorical"

export type ColumnInfo = {
  name: string
  kind: ColumnKind
}

export type ChartType = "kpi" | "bar" | "line" | "pie" | "scatter" | "table"

export type ChartSpec = {
  type: ChartType
  /** Column used for the x-axis / labels (absent for kpi/table). */
  xKey?: string
  /** Numeric columns plotted as series. */
  yKeys: string[]
  /** Human-readable reason why this chart type was chosen. */
  reason: string
}

export type QueryResponse = {
  question: string
  sql: string
  explanation: string
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  chart: ChartSpec
  elapsedMs: number
}

export type QueryError = {
  error: string
  /** Set when the model needs a better question rather than the server failing. */
  clarification?: string
  /** The SQL that was blocked or failed, for transparency. */
  sql?: string
}
