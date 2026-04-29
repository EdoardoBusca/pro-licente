"use client"

import { useMemo, useState } from "react"
import {
  ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, TrendingUp,
  ChevronDown, ChevronUp, Activity, Zap, Clock, Target,
  Lightbulb, BookOpen, CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrainingResult, ArbitrageSignal } from "@/src/types"
import { InfoTip } from "@/components/ui/info-tip"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

const safeNum = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parseMarketLabel(raw: string) {
  const lower = (raw ?? "").toLowerCase()
  if (lower.startsWith("hot"))    return { label: "Hot Market",      dot: "#EF4444" }
  if (lower.startsWith("cold"))   return { label: "Cold Market",     dot: "#3B82F6" }
  if (lower.startsWith("seller")) return { label: "Seller's Market", dot: "#F97316" }
  if (lower.startsWith("buyer"))  return { label: "Buyer's Market",  dot: "#3B82F6" }
  return                                 { label: "Balanced Market",  dot: "#10B981" }
}

// ─── Strategy text ────────────────────────────────────────────────────────────

function buildStrategy(result: TrainingResult): string {
  const cycle      = result.market_dynamics?.temporal_analysis?.market_cycle ?? "Balanced"
  const buys       = result.arbitrage?.buy_signals?.length ?? 0
  const risks      = result.arbitrage?.risk_signals?.length ?? 0
  const confidence = safeNum(result.composite_confidence_score).toFixed(0)
  const mape       = safeNum(result.mape).toFixed(1)
  const winner     = result.winner ?? "the ensemble model"
  const days       = safeNum(result.market_dynamics?.sales_velocity?.expected_days_to_sell, 0)
  const r2         = safeNum(result.r2_score).toFixed(3)

  const marketSentence =
    cycle.toLowerCase().includes("hot")
      ? "The market is running hot — low inventory and strong demand are compressing time-to-close."
      : cycle.toLowerCase().includes("cold") || cycle.toLowerCase().includes("slow")
      ? "The market is cooling. Buyers hold negotiating leverage and days-on-market are rising."
      : "Market conditions are balanced with moderate buyer and seller activity."

  const signalSentence =
    buys > 0 && risks > 0
      ? `The AI engine detected <strong>${buys} underpriced opportunit${buys === 1 ? "y" : "ies"}</strong> and flagged <strong>${risks} overpriced risk${risks === 1 ? "" : "s"}</strong> in the dataset.`
      : buys > 0
      ? `The AI engine identified <strong>${buys} high-confidence buy signal${buys === 1 ? "" : "s"}</strong> — properties trading below their intrinsic AI valuation.`
      : risks > 0
      ? `Caution: the engine flagged <strong>${risks} overpriced propert${risks === 1 ? "y" : "ies"}</strong>. Avoid chasing these listings at current ask prices.`
      : "The dataset shows no significant mispricing. Properties appear fairly valued relative to AI estimates."

  const modelSentence = `The winning algorithm is <strong>${winner}</strong> with an R² of ${r2} and a MAPE of ${mape}% — achieving <strong>${confidence}% AI precision</strong>. ${
    days > 0 ? `Assets in this dataset are expected to clear in approximately <strong>${days} days</strong>.` : ""
  }`

  const actionSentence =
    buys >= 3
      ? "Recommended action: prioritise due diligence on the flagged buy signals before the window narrows."
      : risks >= 3
      ? "Recommended action: re-evaluate any overpriced holdings and consider repositioning at a lower ask."
      : "Recommended action: continue monitoring market momentum and re-run the engine as new data arrives."

  return [marketSentence, signalSentence, modelSentence, actionSentence].join(" ")
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
    })),
    [result.market_dynamics?.price_discovery],
  )

  const aiPredictedValue = safeNum(discoveryData.find((d) => d.kind === "final")?.value ?? 0)
  const positiveImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value > 0).reduce((s, d) => s + d.value, 0)
  const negativeImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value < 0).reduce((s, d) => s + d.value, 0)

  const salesVelocity = result.market_dynamics?.sales_velocity
  const marketStatus  = parseMarketLabel(salesVelocity?.market_label ?? "")
  const daysToSell    = safeNum(salesVelocity?.expected_days_to_sell, 0)
  const sentimentRaw  = safeNum(result.market_sentiment_monthly, 0)
  const sentimentPct  = (sentimentRaw * 100).toFixed(1)
  const sentimentPos  = sentimentRaw >= 0
  const marketCycle   = result.market_dynamics?.temporal_analysis?.market_cycle ?? "—"

  const radarData = useMemo(() => {
    const lb    = (result.leaderboard ?? []).slice(0, 5)
    const maxR2 = Math.max(...lb.map((m) => safeNum(m.r2)), 0.001)
    return lb.map((m) => ({
      model:     m.name.replace(/Regressor|Regression/gi, "").replace("Random Forest", "RF").replace("Gradient Boosting", "GBM").trim(),
      agreement: maxR2 > 0 ? Math.round((safeNum(m.r2) / maxR2) * 100) : 0,
      r2:        safeNum(m.r2),
    }))
  }, [result.leaderboard])

  const avgR2 = useMemo(() => {
    if (!result.leaderboard?.length) return 0
    return result.leaderboard.reduce((s, m) => s + safeNum(m.r2), 0) / result.leaderboard.length
  }, [result.leaderboard])

  const feats = useMemo(() => {
    const fi  = result.feature_importance ?? []
    const top = fi.slice(0, 7)
    const max = Math.max(...top.map((f) => safeNum(f.importance)), 0.001)
    return top.map((f) => ({
      name: f.feature.replace(/_/g, " "),
      pct:  Math.round((safeNum(f.importance) / max) * 100),
    }))
  }, [result.feature_importance])

  const buySignals  = result.arbitrage?.buy_signals  ?? []
  const riskSignals = result.arbitrage?.risk_signals ?? []
  const visibleBuy  = showAllSignals ? buySignals  : buySignals.slice(0, 3)
  const visibleRisk = showAllSignals ? riskSignals : riskSignals.slice(0, 3)

  const strategyHtml = buildStrategy(result)
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
              { label: "MAPE",       value: `${safeNum(result.mape).toFixed(1)}%`,                                      highlight: true, tip: "Mean Absolute Percentage Error on held-out test data. Lower is better." },
              { label: "Confidence", value: `${safeNum(result.composite_confidence_score).toFixed(0)}%`,                 tip: "Composite AI confidence score across all models." },
              { label: "Uplift",     value: positiveImpact > 0 ? `+${fmtK(positiveImpact)}` : "—",                      tip: "Total positive feature impact on predicted price." },
              { label: "Time to Sell", value: daysToSell > 0 ? `${daysToSell}d` : "—",                                  tip: "Expected days to sell based on market velocity." },
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

      {/* ── Model Consensus + Feature Leverage ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Model Consensus</CardTitle>
            <p className="text-sm text-muted-foreground">Agreement across prediction algorithms</p>
          </CardHeader>
          <CardContent>
            {radarData.length >= 3 ? (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="model" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Radar dataKey="agreement" stroke="hsl(var(--foreground))" fill="hsl(var(--foreground))" fillOpacity={0.08} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [`${v}%`, "Agreement"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 p-3 bg-muted/40 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Average R²</span>
                  <span className="text-sm font-semibold tabular-nums">{avgR2.toFixed(3)}</span>
                </div>
              </>
            ) : (
              <EmptyState label="Not enough models for consensus view." />
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-1">
              Feature Leverage
              <InfoTip text="Which property attributes most influenced price predictions, derived from SHAP values." />
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
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums ml-3">{f.pct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="h-full rounded-full bg-foreground transition-all duration-500"
                          style={{ width: `${f.pct}%`, opacity: 0.15 + (f.pct / 100) * 0.85 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
                  Showing {feats.length} of {result.feature_importance?.length ?? 0} features
                </p>
              </>
            ) : (
              <EmptyState label="No feature importance data available." />
            )}
          </CardContent>
        </Card>
      </div>

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

      {/* ── Strategy Recommendation ──────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg font-semibold">Strategy Recommendation</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">AI-generated market intelligence based on current dataset</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: strategyHtml }} />
          <div className="mt-5 grid grid-cols-3 gap-3 pt-5 border-t border-border">
            {[
              { icon: <BookOpen className="w-3 h-3" />, label: "Winning Model",      value: result.winner ?? "—" },
              { icon: <Activity className="w-3 h-3" />,  label: "Confidence Score",  value: `${safeNum(result.composite_confidence_score).toFixed(0)}%`, green: true },
              { icon: <Target className="w-3 h-3" />,    label: "Flagged Properties", value: `${(result.arbitrage?.buy_signals?.length ?? 0) + (result.arbitrage?.risk_signals?.length ?? 0)}` },
            ].map(({ icon, label, value, green }) => (
              <div key={label} className="bg-muted/40 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">{icon}{label}</div>
                <p className={`text-sm font-semibold truncate ${green ? "text-emerald-600" : "text-foreground"}`}>{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
