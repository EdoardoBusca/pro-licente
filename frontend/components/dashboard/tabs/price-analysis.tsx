"use client"

import { useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
  CartesianGrid, ReferenceLine, Tooltip, LabelList,
  BarChart as HBarChart,
} from "recharts"
import { Download, TrendingUp, TrendingDown, Activity, AlertCircle, CheckCircle2 } from "lucide-react"
import type { TrainingResult } from "@/src/types"
import { InfoTip } from "@/components/ui/info-tip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

const safeNum = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function barColor(kind: string, change: number): string {
  if (kind === "baseline") return "#94A3B8"
  if (kind === "final")    return "#0F172A"
  return change >= 0 ? "#10B981" : "#EF4444"
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d   = payload[0].payload
  const val = safeNum(d.value)
  const color =
    d.kind === "baseline" ? "#64748B" :
    d.kind === "final"    ? "#0F172A" :
    val >= 0              ? "#10B981" : "#EF4444"

  const typeLabel =
    d.kind === "baseline" ? "Market Baseline" :
    d.kind === "final"    ? "AI Final Price"  :
    val >= 0              ? "Price Uplift"    : "Price Drag"

  return (
    <div className="rounded-xl px-4 py-3 bg-card border border-border shadow-xl text-sm max-w-[220px]">
      <p className="font-semibold text-foreground mb-0.5">{d.name}</p>
      <p className="text-xs text-muted-foreground mb-2">{typeLabel}</p>
      <p className="text-base font-bold" style={{ color }}>
        {d.kind === "impact" && val > 0 ? "+" : ""}{fmt(val)}
      </p>
    </div>
  )
}

function CorrTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 bg-card border border-border shadow-xl text-xs">
      <p className="font-semibold text-foreground">{d.feature.replace(/_/g, " ")}</p>
      <p className="text-muted-foreground mt-0.5">Correlation with price: <strong>{(d.correlation * 100).toFixed(1)}%</strong></p>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PriceAnalysisTabProps {
  result: TrainingResult
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PriceAnalysisTab({ result }: PriceAnalysisTabProps) {

  // ── Waterfall data ───────────────────────────────────────────────────────
  const discoveryData = useMemo(() =>
    (result.market_dynamics?.price_discovery ?? []).map((d) => ({
      name:  d.name,
      value: safeNum(d.change),
      kind:  d.kind,
      fill:  barColor(d.kind, safeNum(d.change)),
    })),
    [result.market_dynamics?.price_discovery],
  )

  const baselineValue    = safeNum(discoveryData.find((d) => d.kind === "baseline")?.value)
  const predictedValue   = safeNum(discoveryData.find((d) => d.kind === "final")?.value)
  const positiveImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value > 0).reduce((s, d) => s + d.value, 0)
  const negativeImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value < 0).reduce((s, d) => s + d.value, 0)

  // ── Waterfall connector lines ────────────────────────────────────────────
  const connectors = useMemo(() => {
    const rows: { from: string; to: string; y: number }[] = []
    let running = 0
    for (let i = 0; i < discoveryData.length; i++) {
      const d = discoveryData[i]
      if (d.kind === "baseline") { running = d.value; continue }
      rows.push({ from: discoveryData[i - 1]?.name ?? d.name, to: d.name, y: running })
      running = d.kind === "final" ? d.value : running + d.value
    }
    return rows
  }, [discoveryData])

  // ── Confidence range ─────────────────────────────────────────────────────
  const mape      = safeNum(result.mape)
  const predStd   = safeNum(result.prediction_std)
  const lowBound  = predictedValue * (1 - mape / 100)
  const highBound = predictedValue * (1 + mape / 100)
  const stdLow    = predictedValue - predStd
  const stdHigh   = predictedValue + predStd

  // ── Feature correlations ─────────────────────────────────────────────────
  const correlations = useMemo(() => {
    const raw = result.correlation_matrix ?? []
    return raw
      .filter((c) => Math.abs(safeNum(c.correlation)) > 0.05)
      .sort((a, b) => Math.abs(safeNum(b.correlation)) - Math.abs(safeNum(a.correlation)))
      .slice(0, 10)
      .map((c) => ({
        feature:     c.feature.replace(/_/g, " "),
        correlation: safeNum(c.correlation),
        abs:         Math.abs(safeNum(c.correlation)),
        fill:        safeNum(c.correlation) >= 0 ? "#10B981" : "#EF4444",
      }))
  }, [result.correlation_matrix])

  // ── Residual stats ───────────────────────────────────────────────────────
  const rs = result.model_diagnostics?.residual_stats

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = discoveryData.map((d) => `${d.name},${d.value},${d.kind}`)
    const csv  = ["feature,value,kind", ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "price_analysis.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Factor table rows ────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    let running = 0
    const denom = Math.max(Math.abs(predictedValue - baselineValue), baselineValue * 0.001, 1000)
    return discoveryData.map((d, i) => {
      if (d.kind !== "final") running += d.value
      else running = d.value
      const sharePct = d.kind === "impact" ? (d.value / denom) * 100 : null
      return { ...d, running, sharePct, index: i }
    })
  }, [discoveryData, predictedValue, baselineValue])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <Activity className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">AI Predicted Value</p>
              <h2 className="text-3xl font-semibold tabular-nums mb-3">
                {predictedValue > 0 ? fmtK(predictedValue) : "—"}
              </h2>
              <div className="flex items-center gap-2 text-sm text-estate-green">
                <CheckCircle2 className="w-4 h-4" />
                <span>±{mape.toFixed(1)}% MAPE confidence</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 shrink-0">
            {[
              { label: "Market Baseline", value: baselineValue > 0 ? fmtK(baselineValue) : "—",      highlight: false, tip: "Average comparable price used as the starting point." },
              { label: "Total Uplift",    value: positiveImpact > 0 ? `+${fmtK(positiveImpact)}` : "—", highlight: true,  tip: "Sum of all positive feature contributions above baseline." },
              { label: "Total Drag",      value: negativeImpact < 0 ? fmtK(negativeImpact) : "—",    highlight: false, tip: "Sum of all negative feature contributions." },
            ].map(({ label, value, highlight, tip }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-background/50 mb-1 flex items-center justify-center gap-0.5">
                  {label}<InfoTip text={tip} />
                </p>
                <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-estate-green" : ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2. WATERFALL CHART ───────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
                Price Discovery Waterfall
                <InfoTip text="Starts from the market baseline (average price) and applies each feature's contribution one by one until reaching the final AI prediction. Green bars add value, red bars subtract it." />
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                How each property characteristic moves the price from baseline to final prediction
              </p>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {discoveryData.length > 0 ? (
            <>
              <div style={{ height: 460 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={discoveryData} margin={{ top: 28, right: 24, left: 12, bottom: 72 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.25} strokeWidth={1.5} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-40}
                      textAnchor="end"
                      height={72}
                    />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmtK}
                      width={76}
                    />
                    <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    {connectors.map((line, i) => (
                      <ReferenceLine
                        key={i}
                        segment={[{ x: line.from, y: line.y }, { x: line.to, y: line.y }]}
                        stroke="hsl(var(--border))"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    ))}
                    <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={64}>
                      {discoveryData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(value: number, _: string, item: { payload?: { kind?: string } }) => {
                          if (item?.payload?.kind === "impact" && value > 0) return `+${fmtK(value)}`
                          return fmtK(value)
                        }}
                        style={{ fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-8 mt-2 pt-4 border-t border-border">
                {[
                  { color: "#94A3B8", label: "Baseline — average market price" },
                  { color: "#10B981", label: "Uplift — feature adds value" },
                  { color: "#EF4444", label: "Drag — feature reduces value" },
                  { color: "#0F172A", label: "Final — AI prediction" },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              No price discovery data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 3. FULL FACTOR TABLE ─────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Factor Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every component contributing to the final AI valuation, in order of application
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["#", "Factor", "Type", "Dollar Impact", "Share of Move", "Running Total"].map((h) => (
                    <th key={h} className={`py-3 px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${h === "#" ? "text-left w-12" : h === "Factor" ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((d) => {
                  const isPos = d.value >= 0
                  return (
                    <tr key={d.index} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-5 text-xs text-muted-foreground tabular-nums">{d.index + 1}</td>
                      <td className="py-3.5 px-5 font-medium text-foreground">{d.name}</td>
                      <td className="py-3.5 px-5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          d.kind === "baseline" ? "bg-muted text-muted-foreground" :
                          d.kind === "final"    ? "bg-foreground text-background" :
                          isPos                 ? "bg-emerald-50 text-emerald-700" :
                                                  "bg-red-50 text-red-600"
                        }`}>
                          {d.kind === "baseline" ? "Baseline" : d.kind === "final" ? "Final" : isPos ? "Uplift" : "Drag"}
                        </span>
                      </td>
                      <td className={`py-3.5 px-5 text-right font-semibold tabular-nums text-sm ${
                        d.kind === "baseline" || d.kind === "final" ? "text-foreground" :
                        isPos ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {d.kind === "impact" && isPos ? "+" : ""}{fmt(d.value)}
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums text-sm text-muted-foreground">
                        {d.sharePct != null
                          ? <span className={d.sharePct >= 0 ? "text-emerald-600" : "text-red-500"}>
                              {d.sharePct >= 0 ? "+" : ""}{d.sharePct.toFixed(1)}%
                            </span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </td>
                      <td className="py-3.5 px-5 text-right tabular-nums font-medium text-foreground">{fmt(d.running)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. CONFIDENCE RANGE + CORRELATIONS ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Price Confidence Range
              <InfoTip text="The realistic price window around the AI prediction, derived from model error rates and prediction variance." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictedValue > 0 ? (
              <>
                <div className="relative h-16 mb-6 flex items-center">
                  <div className="absolute inset-x-0 h-2 bg-muted rounded-full" />
                  <div
                    className="absolute h-4 bg-emerald-100 rounded-full border border-emerald-200"
                    style={{ left: `${((lowBound / highBound) * 0.15) * 100}%`, right: "5%" }}
                  />
                  <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                    <div className="w-0.5 h-8 bg-foreground" />
                    <span className="text-xs font-bold text-foreground tabular-nums">{fmt(predictedValue)}</span>
                  </div>
                  <span className="absolute left-0 top-6 text-xs text-muted-foreground tabular-nums">{fmt(lowBound)}</span>
                  <span className="absolute right-0 top-6 text-xs text-muted-foreground tabular-nums text-right">{fmt(highBound)}</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">MAPE-based range</p>
                      <p className="text-xs text-muted-foreground mt-0.5">±{mape.toFixed(1)}% from prediction</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {fmt(lowBound)} – {fmt(highBound)}
                    </p>
                  </div>
                  {predStd > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div>
                        <p className="text-sm font-medium text-foreground">1σ prediction band</p>
                        <p className="text-xs text-muted-foreground mt-0.5">±${Math.round(predStd).toLocaleString()} std deviation</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {fmt(stdLow)} – {fmt(stdHigh)}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Net price movement</p>
                      <p className="text-xs text-muted-foreground mt-0.5">AI prediction vs baseline</p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${predictedValue >= baselineValue ? "text-emerald-600" : "text-red-500"}`}>
                      {predictedValue >= baselineValue ? "+" : ""}{fmt(predictedValue - baselineValue)}
                      {" "}({((predictedValue - baselineValue) / baselineValue * 100).toFixed(1)}%)
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 p-3 bg-muted/40 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    These ranges reflect model uncertainty, not market guarantees. Actual sale prices depend on negotiation, timing, and buyer demand.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No prediction data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
              Feature–Price Correlations
              <InfoTip text="Pearson correlation between each feature and the sale price. Positive = higher values → higher prices. Negative = inverse relationship." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {correlations.length > 0 ? (
              <div className="space-y-2.5">
                {correlations.map((c) => (
                  <div key={c.feature}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-foreground capitalize truncate max-w-[60%]">{c.feature}</span>
                      <span className={`text-xs font-semibold tabular-nums ${c.correlation >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {c.correlation >= 0 ? "+" : ""}{(c.correlation * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="absolute h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${c.abs * 100}%`,
                          background: c.correlation >= 0 ? "#10B981" : "#EF4444",
                          [c.correlation >= 0 ? "left" : "right"]: 0,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No correlation data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 5. RESIDUAL STATS ────────────────────────────────────────────── */}
      {rs && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
              Prediction Error Distribution
              <InfoTip text="Statistics about how far off the model's predictions were on held-out test data. A median near $0 means the model has no systematic bias." />
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              How prediction errors were distributed across the test set
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y md:divide-y-0 divide-border">
              {[
                { label: "Mean error",    value: fmt(safeNum(rs.mean)),   sub: "Expected bias",      color: Math.abs(safeNum(rs.mean)) < safeNum(result.mae) * 0.1 ? "text-emerald-600" : "text-red-500" },
                { label: "Median error",  value: fmt(safeNum(rs.median)), sub: "Typical prediction", color: "text-foreground" },
                { label: "Std deviation", value: fmt(safeNum(rs.std)),    sub: "Spread of errors",   color: "text-foreground" },
                { label: "Q1 (25th pct)", value: fmt(safeNum(rs.q1)),     sub: "Lower quartile",     color: "text-foreground" },
                { label: "Q3 (75th pct)", value: fmt(safeNum(rs.q3)),     sub: "Upper quartile",     color: "text-foreground" },
                { label: "Error range",   value: `${fmt(safeNum(rs.min))} – ${fmt(safeNum(rs.max))}`, sub: "Min to max error", color: "text-foreground" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="px-5 py-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
                  <p className={`text-base font-semibold tabular-nums leading-tight ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                </div>
              ))}
            </div>
            {Math.abs(safeNum(rs.mean)) < safeNum(result.mae) * 0.1 && (
              <div className="px-6 py-3 border-t border-border bg-emerald-50/50 flex items-center gap-2 text-xs text-emerald-700">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                Mean error is near zero — the model shows no significant systematic bias.
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
