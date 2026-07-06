"use client"

import { useMemo, useState } from "react"
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid, ReferenceLine, Tooltip, LabelList,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, TrendingUp,
  ChevronDown, ChevronUp, Activity, Target,
  CheckCircle2, Download,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrainingResult, ArbitrageSignal } from "@/src/types"
import { InfoTip } from "@/components/ui/info-tip"
import { fmt, fmtK, safeNum } from "@/lib/format"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMarketLabel(raw: string) {
  const lower = (raw ?? "").toLowerCase()
  if (lower.startsWith("hot"))    return { label: "Hot Market",      dot: "#EF4444" }
  if (lower.startsWith("cold"))   return { label: "Cold Market",     dot: "#3B82F6" }
  if (lower.startsWith("seller")) return { label: "Seller's Market", dot: "#F97316" }
  if (lower.startsWith("buyer"))  return { label: "Buyer's Market",  dot: "#3B82F6" }
  return                                 { label: "Balanced Market",  dot: "#10B981" }
}

function barColor(kind: string, change: number): string {
  if (kind === "baseline") return "#94A3B8"
  if (kind === "final")    return "#0F172A"
  return change >= 0 ? "#10B981" : "#EF4444"
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface ValuationEngineTabProps {
  result: TrainingResult
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ValuationEngineTab({ result }: ValuationEngineTabProps) {
  const [showAllSignals, setShowAllSignals] = useState(false)

  const discoveryData = useMemo(() =>
    (result.market_dynamics?.price_discovery ?? []).map((d) => ({
      name:  d.name,
      value: safeNum(d.change),
      kind:  d.kind,
      fill:  barColor(d.kind, safeNum(d.change)),
    })),
    [result.market_dynamics?.price_discovery],
  )

  const baselineValue   = safeNum(discoveryData.find((d) => d.kind === "baseline")?.value)
  const aiPredictedValue = safeNum(discoveryData.find((d) => d.kind === "final")?.value ?? 0)
  const positiveImpact  = discoveryData.filter((d) => d.kind === "impact" && d.value > 0).reduce((s, d) => s + d.value, 0)
  const negativeImpact  = discoveryData.filter((d) => d.kind === "impact" && d.value < 0).reduce((s, d) => s + d.value, 0)

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
  const lowBound  = aiPredictedValue * (1 - mape / 100)
  const highBound = aiPredictedValue * (1 + mape / 100)
  const stdLow    = aiPredictedValue - predStd
  const stdHigh   = aiPredictedValue + predStd

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = discoveryData.map((d) => `${d.name},${d.value},${d.kind}`)
    const csv  = ["feature,value,kind", ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "price_discovery.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const salesVelocity = result.market_dynamics?.sales_velocity
  const marketStatus  = parseMarketLabel(salesVelocity?.market_label ?? "")
  const daysToSell    = safeNum(salesVelocity?.expected_days_to_sell, 0)
  const marketCycle   = result.market_dynamics?.temporal_analysis?.market_cycle ?? "—"

  const feats = useMemo(() => {
    const fi  = result.feature_importance ?? []
    const top = fi.slice(0, 7)
    const max = Math.max(...top.map((f) => safeNum(f.importance)), 0.001)
    return top.map((f) => ({
      name:     f.feature.replace(/_/g, " "),
      pct:      Math.round((safeNum(f.importance) / max) * 100),
      positive: safeNum(result.correlation_lookup?.[f.feature], 0) >= 0,
    }))
  }, [result.feature_importance, result.correlation_lookup])

  const buySignals  = result.arbitrage?.buy_signals  ?? []
  const riskSignals = result.arbitrage?.risk_signals ?? []
  const visibleBuy  = showAllSignals ? buySignals  : buySignals.slice(0, 3)
  const visibleRisk = showAllSignals ? riskSignals : riskSignals.slice(0, 3)

  const strategyTasks = (() => {
    const candidateCount = buySignals.length
    const riskCount = riskSignals.length
    const expectedDays = daysToSell > 0 ? daysToSell : null
    return [
      {
        title: "Prioritize acquisition queue",
        detail:
          candidateCount > 0
            ? `Focus due diligence on ${candidateCount} undervalued candidate${candidateCount === 1 ? "" : "s"} first.`
            : "No discounted assets detected now; keep screening weekly as new listings arrive.",
        color: "#10B981",
      },
      {
        title: "Manage pricing risk",
        detail:
          riskCount > 0
            ? `${riskCount} listing${riskCount === 1 ? " is" : "s are"} flagged as overpriced. Negotiate harder or reprice existing holdings.`
            : "Current portfolio appears fairly priced versus AI benchmarks.",
        color: "#EF4444",
      },
      {
        title: "Execution timing",
        detail:
          expectedDays
            ? `Expected absorption is about ${expectedDays} days; align financing and marketing cadence to this window.`
            : "Time-to-sale data is not available yet; use conservative hold assumptions.",
        color: "#94A3B8",
      },
    ] as const
  })()

  return (
    <div className="space-y-6">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">AI Predicted Value</p>
              <h2 className="text-3xl font-semibold tabular-nums mb-3">
                {aiPredictedValue > 0 ? fmtK(aiPredictedValue) : "—"}
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-estate-green">
                  <CheckCircle2 className="w-4 h-4" />
                  {marketStatus.label}
                </span>
                <span className="text-background/40">·</span>
                <span className="text-background/60">{marketCycle}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6 shrink-0">
            {[
              { label: "MAPE",       value: `${mape.toFixed(1)}%`,                                       highlight: true, tip: "Mean Absolute Percentage Error on held-out test data. Lower is better." },
              { label: "Confidence", value: `${safeNum(result.composite_confidence_score).toFixed(0)}%`,  tip: "Composite AI confidence score across all models." },
              { label: "Uplift",     value: positiveImpact > 0 ? `+${fmtK(positiveImpact)}` : "—",        tip: "Total positive feature impact on predicted price." },
              { label: "Time to Sell", value: daysToSell > 0 ? `${daysToSell}d` : "—",                    tip: "Expected days to sell based on market velocity." },
            ].map(({ label, value, highlight, tip }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-background/50 mb-1 flex items-center justify-center gap-0.5">
                  {label}{tip && <InfoTip text={tip} />}
                </p>
                <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-estate-green" : ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Price Discovery Waterfall ────────────────────────────────────────── */}
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

      {/* ── Strategy Snapshot ────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Strategy Snapshot</CardTitle>
          <p className="text-sm text-muted-foreground">Action-first interpretation of current model outputs</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-border">
            {strategyTasks.map((task) => (
              <div key={task.title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: task.color }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{task.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{task.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Feature Leverage ─────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-1">
            Feature Leverage
            <InfoTip text="Which property attributes most influenced price predictions (model feature importance). Green means the feature correlates with higher prices, red with lower prices." />
          </CardTitle>
          <p className="text-sm text-muted-foreground">Top price-driving characteristics</p>
        </CardHeader>
        <CardContent>
          {feats.length > 0 ? (
            <>
              <div className="space-y-3">
                {feats.map((f) => (
                  <div key={f.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground truncate capitalize">{f.name}</span>
                      <span className={`text-xs font-semibold tabular-nums ml-3 ${f.positive ? "text-emerald-600" : "text-red-500"}`}>
                        {f.positive ? "+" : "−"}{f.pct}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${f.positive ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${f.pct}%`, opacity: 0.35 + (f.pct / 100) * 0.65 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
                Showing {feats.length} of {result.feature_importance?.length ?? 0} features · color shows direction (green = raises price, red = lowers it)
              </p>
            </>
          ) : (
            <EmptyState label="No feature importance data available." />
          )}
        </CardContent>
      </Card>

      {/* ── Price Confidence Range ───────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Price Confidence Range
            <InfoTip text="The realistic price window around the AI prediction, derived from model error rates and prediction variance." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiPredictedValue > 0 ? (
            <>
              <div className="relative h-16 mb-6 flex items-center">
                <div className="absolute inset-x-0 h-2 bg-muted rounded-full" />
                <div
                  className="absolute h-4 bg-emerald-100 rounded-full border border-emerald-200"
                  style={{ left: `${((lowBound / highBound) * 0.15) * 100}%`, right: "5%" }}
                />
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                  <div className="w-0.5 h-8 bg-foreground" />
                  <span className="text-xs font-bold text-foreground tabular-nums">{fmt(aiPredictedValue)}</span>
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
                  <p className={`text-sm font-semibold tabular-nums ${aiPredictedValue >= baselineValue ? "text-emerald-600" : "text-red-500"}`}>
                    {aiPredictedValue >= baselineValue ? "+" : ""}{fmt(aiPredictedValue - baselineValue)}
                    {" "}({((aiPredictedValue - baselineValue) / baselineValue * 100).toFixed(1)}%)
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No prediction data available.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Valuation Signals ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-1">
                  Buy Signals
                  <InfoTip text="Properties where the AI's estimated value is significantly higher than the list price." side="bottom" />
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">Undervalued opportunities</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                {result.arbitrage?.undervalued_count ?? 0}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {visibleBuy.length > 0 ? (
              <div className="space-y-2">
                {visibleBuy.map((sig: ArbitrageSignal, i: number) => (
                  <SignalRow key={i} sig={sig} positive />
                ))}
                {buySignals.length > 3 && (
                  <button className="w-full text-xs pt-2 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAllSignals((p) => !p)}>
                    {showAllSignals ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> +{buySignals.length - 3} more</>}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState label="No buy signals detected." />
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-1">
                  Risk Alerts
                  <InfoTip text="Properties where the list price significantly exceeds the AI's valuation." side="bottom" />
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">Overpriced properties</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">
                {result.arbitrage?.overpriced_count ?? 0}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {visibleRisk.length > 0 ? (
              <div className="space-y-2">
                {visibleRisk.map((sig: ArbitrageSignal, i: number) => (
                  <SignalRow key={i} sig={sig} positive={false} />
                ))}
                {riskSignals.length > 3 && (
                  <button className="w-full text-xs pt-2 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAllSignals((p) => !p)}>
                    {showAllSignals ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> +{riskSignals.length - 3} more</>}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState label="No risk signals detected." />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalRow({ sig, positive }: { sig: ArbitrageSignal; positive: boolean }) {
  const delta    = safeNum(sig.delta_pct)
  const extraVal = safeNum(positive ? sig.potential_gain : sig.potential_loss)
  const Arrow    = positive ? ArrowUpRight : ArrowDownRight
  const accent   = positive ? "#10B981" : "#EF4444"

  return (
    <div
      className="rounded-xl border border-border bg-card px-4 py-3 border-l-4"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Arrow className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-sm font-medium text-foreground">Property #{sig.property_idx}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>List: {fmt(safeNum(sig.list_price))}</span>
        <span>AI: {fmt(safeNum(sig.ai_value))}</span>
      </div>
      {extraVal > 0 && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs">
          <span className="text-muted-foreground">{positive ? "Potential gain" : "Estimated risk"}</span>
          <span className="font-semibold tabular-nums" style={{ color: accent }}>{fmt(extraVal)}</span>
        </div>
      )}
      {sig.alert && <p className="text-xs mt-2 text-muted-foreground">{sig.alert}</p>}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <Target className="w-5 h-5 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
