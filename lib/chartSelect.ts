import type { ChartSpec, ColumnInfo, ColumnKind } from "@/lib/types"

/**
 * Automatic chart selection.
 *
 * Heuristics (documented in README):
 *   1 row × 1 numeric                    -> KPI card
 *   temporal + numeric(s)                -> line chart (time series)
 *   categorical + numeric(s), ≤30 cats   -> bar chart
 *     └ ≤6 categories, 1 non-negative numeric -> pie chart
 *   ≥2 numerics, no categorical/temporal -> scatter plot
 *   anything else                        -> table
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/
const YEAR_MONTH = /^\d{4}-\d{2}$/

export function classifyColumns(rows: Record<string, unknown>[]): ColumnInfo[] {
  if (rows.length === 0) return []
  const names = Object.keys(rows[0])
  return names.map((name) => {
    const samples = rows
      .slice(0, 50)
      .map((r) => r[name])
      .filter((v) => v !== null && v !== undefined)
    let kind: ColumnKind = "categorical"
    if (samples.length > 0) {
      if (samples.every((v) => typeof v === "number")) {
        kind = "numeric"
      } else if (
        samples.every(
          (v) =>
            v instanceof Date ||
            (typeof v === "string" && (ISO_DATE.test(v) || YEAR_MONTH.test(v))),
        )
      ) {
        kind = "temporal"
      }
    }
    return { name, kind }
  })
}

export function selectChart(
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
): ChartSpec {
  const numeric = columns.filter((c) => c.kind === "numeric")
  const temporal = columns.filter((c) => c.kind === "temporal")
  const categorical = columns.filter((c) => c.kind === "categorical")

  if (rows.length === 0) {
    return { type: "table", yKeys: [], reason: "The query returned no rows." }
  }

  // KPI: a single scalar answer ("what was total revenue last month?")
  if (rows.length === 1 && numeric.length === 1) {
    return {
      type: "kpi",
      yKeys: [numeric[0].name],
      reason: "Single numeric value — shown as a headline metric.",
    }
  }

  // Time series -> line
  if (temporal.length >= 1 && numeric.length >= 1 && rows.length >= 2) {
    return {
      type: "line",
      xKey: temporal[0].name,
      yKeys: numeric.slice(0, 4).map((c) => c.name),
      reason: "Time-based dimension with numeric measures — line chart shows the trend.",
    }
  }

  // Category breakdown -> pie (small) or bar
  if (categorical.length >= 1 && numeric.length >= 1 && rows.length <= 30) {
    const y0 = numeric[0].name
    const nonNegative = rows.every((r) => typeof r[y0] === "number" && (r[y0] as number) >= 0)
    if (rows.length <= 6 && numeric.length === 1 && nonNegative) {
      return {
        type: "pie",
        xKey: categorical[0].name,
        yKeys: [y0],
        reason: "Few categories with one non-negative measure — pie chart shows share of total.",
      }
    }
    return {
      type: "bar",
      xKey: categorical[0].name,
      yKeys: numeric.slice(0, 4).map((c) => c.name),
      reason: "Categorical dimension with numeric measures — bar chart compares categories.",
    }
  }

  // Two pure numerics -> scatter (correlation questions)
  if (numeric.length >= 2 && categorical.length === 0 && temporal.length === 0) {
    return {
      type: "scatter",
      xKey: numeric[0].name,
      yKeys: [numeric[1].name],
      reason: "Two numeric columns — scatter plot shows their relationship.",
    }
  }

  return {
    type: "table",
    yKeys: numeric.map((c) => c.name),
    reason: "Result shape doesn't map cleanly to a chart — shown as a table.",
  }
}
