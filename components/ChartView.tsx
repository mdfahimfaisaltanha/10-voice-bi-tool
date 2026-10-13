"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ChartSpec, ColumnInfo } from "@/lib/types"

const COLORS = ["#21c08b", "#4f8cff", "#f0b429", "#f2555a", "#7c5cff", "#e879f9"]
const AXIS = { fill: "#98a0b3", fontSize: 12 }
const GRID = "#29303f"
const TOOLTIP_STYLE = {
  backgroundColor: "#1b2130",
  border: "1px solid #29303f",
  borderRadius: 8,
  color: "#e9ecf2",
  fontSize: 13,
}

function formatNumber(v: unknown): string {
  if (typeof v !== "number") return String(v ?? "—")
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 1 })
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export default function ChartView({
  chart,
  rows,
  columns,
}: {
  chart: ChartSpec
  rows: Record<string, unknown>[]
  columns: ColumnInfo[]
}) {
  if (chart.type === "kpi") {
    const key = chart.yKeys[0]
    return (
      <div className="kpi">
        <div className="num">{formatNumber(rows[0]?.[key])}</div>
        <div className="label">{key.replace(/_/g, " ")}</div>
      </div>
    )
  }

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} tick={AXIS} stroke={GRID} />
          <YAxis tick={AXIS} stroke={GRID} tickFormatter={formatNumber} width={70} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          {chart.yKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={rows.length <= 40}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} tick={AXIS} stroke={GRID} interval={0} angle={rows.length > 8 ? -30 : 0} textAnchor={rows.length > 8 ? "end" : "middle"} height={rows.length > 8 ? 80 : 30} />
          <YAxis tick={AXIS} stroke={GRID} tickFormatter={formatNumber} width={70} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatNumber(v)} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          {chart.yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <PieChart>
          <Pie
            data={rows}
            dataKey={chart.yKeys[0]}
            nameKey={chart.xKey}
            cx="50%"
            cy="50%"
            outerRadius={120}
            label={(entry) => String(entry[chart.xKey as string])}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatNumber(v)} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} name={chart.xKey} tick={AXIS} stroke={GRID} tickFormatter={formatNumber} />
          <YAxis dataKey={chart.yKeys[0]} name={chart.yKeys[0]} tick={AXIS} stroke={GRID} tickFormatter={formatNumber} width={70} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatNumber(v)} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={rows} fill={COLORS[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  // table fallback
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.name}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.name}>{formatNumber(row[c.name])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && <p className="truncated">Showing first 100 of {rows.length} rows.</p>}
    </div>
  )
}
