"use client"

import { useMemo, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ReferenceLine, Tooltip, LabelList,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  Download, ChevronDown, ChevronUp, Activity, Zap, Clock, Target,
  Lightbulb, BookOpen, FlaskConical, Sliders, Eye, EyeOff,
} from "lucide-react"
import type { TrainingResult, ArbitrageSignal } from "@/src/types"

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

function barColor(kind: string, change: number): string {
  if (kind === "baseline") return "#3B82F6"
  if (kind === "final")    return "#F59E0B"
  return change >= 0 ? "#10B981" : "#EF4444"
}

function parseMarketLabel(raw: string) {
  const lower = (raw ?? "").toLowerCase()
  if (lower.startsWith("hot"))    return { label: "Hot Market",      bg: "#EF4444", color: "#fff" }
  if (lower.startsWith("cold"))   return { label: "Cold Market",     bg: "#3B82F6", color: "#fff" }
  if (lower.startsWith("seller")) return { label: "Seller's Market", bg: "#F97316", color: "#fff" }
  if (lower.startsWith("buyer"))  return { label: "Buyer's Market",  bg: "#3B82F6", color: "#fff" }
  return                                 { label: "Balanced Market",  bg: "#E7E5E4", color: "#292524" }
}

const FEATURE_DESCRIPTIONS: [string[], string][] = [
  [["expected value", "baseline"],       "Market baseline derived from the average transaction price in the training dataset."],
  [["sq_ft", "square", "area"],          "Total square footage of the property — the single strongest price driver in most markets."],
  [["zip", "location", "district"],      "Geographic location premium or discount based on historical sales in the same zip code."],
  [["property_type", "type"],            "Property classification (single-family, condo, luxury villa, etc.) affects the pricing tier."],
  [["condition"],                        "Current state of the property and quality of maintenance relative to market average."],
  [["lot"],                              "Total land area — adds value in markets where land is scarce or in low-density zones."],
  [["year", "age", "built"],             "Age and construction era of the property; newer builds typically command a premium."],
  [["bed", "room"],                      "Number of bedrooms relative to comparable properties in the neighborhood."],
  [["bath"],                             "Number of bathrooms — positively correlated with luxury tier and family-size demand."],
  [["school", "rating"],                 "School district quality score — a top predictor of residential demand in family markets."],
  [["days", "market"],                   "Days on market signal — longer listing periods typically indicate overpricing pressure."],
  [["sentiment", "momentum"],            "Macro market sentiment and price momentum over the forecast horizon."],
  [["other factors", "reconciliation"],  "Residual adjustment accounting for minor feature interactions not individually tracked."],
  [["model adjustment"],                 "Overall model correction based on interactions between all features combined."],
]

function featureDescription(name: string): string {
  const n = name.toLowerCase()
  return FEATURE_DESCRIPTIONS.find(([keys]) => keys.some((k) => n.includes(k)))?.[1]
    ?? "Feature impact on the final AI-predicted closing price based on SHAP attribution."
}

// ─── Custom Y-axis tick with color ────────────────────────────────────────────

function ColoredYTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  const v = payload?.value ?? 0
  const color = v > 0 ? "#10B981" : v < 0 ? "#EF4444" : "#9CA3AF"
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={color} fontSize={10} fontWeight={600}>
      {fmtK(v)}
    </text>
  )
}

// ─── Waterfall tooltip ────────────────────────────────────────────────────────

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d   = payload[0].payload
  const val = safeNum(d.value)
  const color = d.kind === "baseline" ? "#3B82F6" : d.kind === "final" ? "#D97706" : val >= 0 ? "#059669" : "#DC2626"
  return (
    <div className="rounded-xl px-4 py-3 text-xs bg-white border border-[#E7E5E4] shadow-xl">
      <p className="font-semibold mb-1 text-[#292524]">{d.name}</p>
      <p style={{ color }}>{d.kind === "impact" && val >= 0 ? "+" : ""}{fmt(val)}</p>
      {d.kind === "impact" && (
        <p className="mt-1 text-[#9CA3AF] max-w-[180px] leading-relaxed">{featureDescription(d.name)}</p>
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ValuationEngineTabProps {
  result: TrainingResult
}

// ─── Strategy text generator ──────────────────────────────────────────────────

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

// ─── Waterfall table rows ─────────────────────────────────────────────────────

function waterfallRows(
  discoveryData: { name: string; value: number; kind: string; fill: string }[],
  aiPredictedValue: number,
  baselineValue: number,
  showTableDetails: boolean,
) {
  let running = 0
  const priceMove = aiPredictedValue - baselineValue
  // Floor at 0.1% of baseline so tiny price moves don't produce nonsense percentages
  const denom = Math.max(Math.abs(priceMove), baselineValue * 0.001, 1000)
  return discoveryData.map((d, i) => {
    if (d.kind !== "final") running += d.value
    else running = d.value
    const isPos = d.value >= 0
    // Keep sign so negative contributions show as negative share (e.g. "-12.3%")
    const sharePct = (d.value / denom) * 100
    const share = d.kind === "impact" ? `${sharePct >= 0 ? "+" : ""}${sharePct.toFixed(1)}%` : "—"
    const rowBg =
      d.kind === "baseline" ? "bg-[#EFF6FF]" :
      d.kind === "final"    ? "bg-[#FFFBEB]" :
      isPos                 ? "hover:bg-[#F0FDF4]" : "hover:bg-[#FEF2F2]"
    const rowLineColor =
      d.kind === "baseline" ? "#CBD5E1" :
      d.kind === "final"    ? "#FCD34D" :
      isPos                 ? "#86EFAC" : "#FCA5A5"
    return (
      <tr key={i} className={`transition-colors ${rowBg}`} style={{ borderBottom: `1px solid ${rowLineColor}` }}>
        <td className="px-3 py-3 text-xs font-semibold text-[#64748B]">{i + 1}</td>
        <td className="px-5 py-3 font-medium text-[#292524]">{d.name}</td>
        <td className="px-4 py-3 text-center">
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={
              d.kind === "baseline" ? { background: "#DBEAFE", color: "#1E40AF" } :
              d.kind === "final"    ? { background: "#FEF3C7", color: "#92400E" } :
              isPos                 ? { background: "#DCFCE7", color: "#15803D" } :
                                      { background: "#FEE2E2", color: "#B91C1C" }
            }>
            {d.kind === "baseline" ? "BASELINE" : d.kind === "final" ? "FINAL" : isPos ? "UPLIFT" : "DRAG"}
          </span>
        </td>
        {showTableDetails && (
          <td className="px-5 py-3 text-xs text-[#64748B] max-w-[280px] leading-relaxed">{featureDescription(d.name)}</td>
        )}
        <td className="px-5 py-3 text-right font-bold"
          style={{ color: d.kind === "baseline" ? "#1F2937" : d.kind === "final" ? "#8A5B24" : isPos ? "#2F7A5D" : "#B4534D" }}>
          {d.kind === "impact" && isPos ? "+" : ""}{fmt(d.value)}
        </td>
        {showTableDetails && <td className="px-5 py-3 text-right text-[#334155] font-semibold font-mono">{share}</td>}
        <td className="px-5 py-3 text-right text-[#57534E] font-semibold font-mono">{fmt(running)}</td>
      </tr>
    )
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ValuationEngineTab({ result }: ValuationEngineTabProps) {
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [showAllSignals, setShowAllSignals] = useState(false)
  const [showTableDetails, setShowTableDetails] = useState(false)

  // ── Price discovery ──────────────────────────────────────────────────────
  const discoveryData = useMemo(() =>
    (result.market_dynamics?.price_discovery ?? []).map((d) => ({
      name:  d.name,
      value: safeNum(d.change),
      kind:  d.kind,
      fill:  barColor(d.kind, safeNum(d.change)),
    })),
    [result.market_dynamics?.price_discovery],
  )

  const baselineValue    = safeNum(discoveryData.find((d) => d.kind === "baseline")?.value ?? 0)
  const aiPredictedValue = safeNum(discoveryData.find((d) => d.kind === "final")?.value ?? 0)
  const positiveImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value > 0).reduce((s, d) => s + d.value, 0)
  const negativeImpact   = discoveryData.filter((d) => d.kind === "impact" && d.value < 0).reduce((s, d) => s + d.value, 0)

  // Impact-only entries for Model Adjustment breakdown
  const impactEntries    = discoveryData.filter((d) => d.kind === "impact")
  const priceUpDrivers   = impactEntries.filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const priceDownDrivers = impactEntries.filter((d) => d.value < 0).sort((a, b) => a.value - b.value)

  // ── Market status ────────────────────────────────────────────────────────
  const salesVelocity = result.market_dynamics?.sales_velocity
  const marketStatus  = parseMarketLabel(salesVelocity?.market_label ?? "")
  const daysToSell    = safeNum(salesVelocity?.expected_days_to_sell, 0)
  const sentimentRaw  = safeNum(result.market_sentiment_monthly, 0)
  const sentimentPct  = (sentimentRaw * 100).toFixed(1)
  const sentimentPos  = sentimentRaw >= 0
  const marketCycle   = result.market_dynamics?.temporal_analysis?.market_cycle ?? "—"

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = (result.full_chart_data ?? result.projection ?? []).map(
      (p) => `${p.day},${p.val},${p.is_historical ? "historical" : "forecast"}`,
    )
    const csv  = ["date,value,type", ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "estate_vantage_forecast.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Radar ────────────────────────────────────────────────────────────────
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

  // ── Features ─────────────────────────────────────────────────────────────
  const feats = useMemo(() => {
    const fi  = result.feature_importance ?? []
    const top = fi.slice(0, 7)
    const max = Math.max(...top.map((f) => safeNum(f.importance)), 0.001)
    return top.map((f) => ({
      name: f.feature.replace(/_/g, " "),
      pct:  Math.round((safeNum(f.importance) / max) * 100),
    }))
  }, [result.feature_importance])

  // ── Signals ───────────────────────────────────────────────────────────────
  const buySignals  = result.arbitrage?.buy_signals  ?? []
  const riskSignals = result.arbitrage?.risk_signals ?? []
  const visibleBuy  = showAllSignals ? buySignals  : buySignals.slice(0, 3)
  const visibleRisk = showAllSignals ? riskSignals : riskSignals.slice(0, 3)

  // ── Strategy ──────────────────────────────────────────────────────────────
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
        tone: "positive",
      },
      {
        title: "Manage pricing risk",
        detail:
          riskCount > 0
            ? `${riskCount} listing${riskCount === 1 ? " is" : "s are"} flagged as overpriced. Negotiate harder or reprice existing holdings.`
            : "Current portfolio appears fairly priced versus AI benchmarks.",
        tone: "negative",
      },
      {
        title: "Execution timing",
        detail:
          expectedDays
            ? `Expected absorption is about ${expectedDays} days; align financing and marketing cadence to this window.`
            : "Time-to-sale data is not available yet; use conservative hold assumptions.",
        tone: "neutral",
      },
    ] as const
  })()

  const waterfallFlow = useMemo(() => {
    const rows: { from: string; to: string; y: number }[] = []
    let running = 0
    for (let i = 0; i < discoveryData.length; i += 1) {
      const d = discoveryData[i]
      if (d.kind === "baseline") {
        running = d.value
        continue
      }
      rows.push({ from: discoveryData[i - 1]?.name ?? d.name, to: d.name, y: running })
      if (d.kind === "final") {
        running = d.value
      } else {
        running += d.value
      }
    }
    return rows
  }, [discoveryData])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ══ 1. TOP THREE CARDS ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Model Accuracy */}
        <div className="bg-gradient-to-br from-[#F7FCF9] to-[#EDF7F0] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-[#2F5D50]" />
            <span className="text-sm font-medium text-[#2F5D50]">Model Accuracy</span>
          </div>
          <div className="mb-2 flex items-end gap-2">
            <span className="text-6xl font-extrabold text-[#1F4F43] font-mono">{safeNum(result.mape).toFixed(1)}%</span>
            <span className="text-base font-medium text-[#3B7465] mb-1">MAPE</span>
          </div>
          <div className="text-sm text-[#315D51]">
            Within <span className="font-bold">{(100 - safeNum(result.mape)).toFixed(1)}%</span> of Market Truth
          </div>
        </div>

        {/* Market Status */}
        <div className="bg-[#FBFCFD] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-[#4B5563]" />
            <span className="text-sm font-medium text-[#4B5563]">Market Status</span>
          </div>
          <div className="mb-4">
            <span className="inline-block px-3 py-1.5 text-sm font-bold rounded-full"
              style={{ background: marketStatus.bg, color: marketStatus.color }}>
              {marketStatus.label}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-[#78716C]">Market Cycle</span>
              <span className="font-semibold text-[#292524] text-right text-xs max-w-[160px] truncate">{marketCycle}</span>
            </div>
            <div className="flex justify-between items-center border-t border-[#F5F5F4] pt-2">
              <span className="text-[#78716C] flex items-center gap-1"><Clock className="w-3 h-3" /> Time to Sale</span>
              <span className="font-bold text-[#292524] font-mono">{daysToSell > 0 ? `${daysToSell} days` : "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#78716C]">Monthly Sentiment</span>
              <span className={`font-bold font-mono ${sentimentPos ? "text-[#2F7A5D]" : "text-[#B4534D]"}`}>
                {sentimentPos ? "+" : ""}{sentimentPct}%
              </span>
            </div>
          </div>
        </div>

        {/* AI Predicted Value */}
        <div className="bg-gradient-to-br from-[#FFF9EE] to-[#F8F1DE] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#6B4E2E]" />
            <span className="text-sm font-medium text-[#6B4E2E]">AI Predicted Value</span>
          </div>
          <div className="text-6xl font-extrabold text-[#8A5B24] mb-3 leading-tight font-mono">
            {aiPredictedValue > 0 ? fmtK(aiPredictedValue) : "—"}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#10B981] flex-shrink-0" />
              <span className="text-[#78716C]">Uplift:</span>
              <span className="font-semibold text-[#2F7A5D] font-mono">{positiveImpact > 0 ? `+${fmtK(positiveImpact)}` : "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] flex-shrink-0" />
              <span className="text-[#78716C]">Detractor:</span>
              <span className="font-semibold text-[#B4534D] font-mono">{negativeImpact < 0 ? fmtK(negativeImpact) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Snapshot */}
      <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
        <div className="border-b border-[#E7E5E4] bg-gradient-to-r from-[#ECFEFF] via-[#F8FAFC] to-white px-6 py-4">
          <h3 className="text-base font-bold text-[#292524]">Strategy Snapshot</h3>
          <p className="text-xs text-[#64748B]">Action-first interpretation of current model outputs</p>
        </div>
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {strategyTasks.map((task) => {
            const palette =
              task.tone === "positive"
                ? { bg: "#F0FDF4", border: "#86EFAC", title: "#166534" }
                : task.tone === "negative"
                ? { bg: "#FEF2F2", border: "#FCA5A5", title: "#991B1B" }
                : { bg: "#EFF6FF", border: "#BFDBFE", title: "#1E3A8A" }

            return (
              <div
                key={task.title}
                className="rounded-xl border p-4"
                style={{ background: palette.bg, borderColor: palette.border }}
              >
                <div className="text-sm font-bold mb-1" style={{ color: palette.title }}>{task.title}</div>
                <div className="text-xs text-[#475569] leading-relaxed">{task.detail}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ 2. PRICE DISCOVERY WATERFALL ════════════════════════════════════ */}
      <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">

        {/* Header */}
        <div className="border-b border-[#E7E5E4] px-6 py-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#292524] mb-1">Price Discovery Waterfall</h3>
            <p className="text-sm text-[#78716C]">Feature-by-feature impact on predicted closing price</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="px-4 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 transition-colors"
              style={showAdjustment
                ? { background: "#EFF6FF", borderColor: "#93C5FD", color: "#1E40AF" }
                : { background: "white", borderColor: "#E7E5E4", color: "#57534E" }}
              onClick={() => setShowAdjustment((p) => !p)}
            >
              <Sliders className="w-4 h-4" />
              Model Adjustment
              {showAdjustment ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-[#57534E] border border-[#E7E5E4] bg-white rounded-lg hover:bg-[#F5F5F4] flex items-center gap-2 transition-colors"
              onClick={handleExport}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="p-6">
          {discoveryData.length > 0 ? (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={discoveryData} margin={{ top: 8, right: 16, left: 16, bottom: 56 }}>
                    <defs>
                      <linearGradient id="gridGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="50%" stopColor="#3B82F6" stopOpacity={0.1} />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#F0F4FF" strokeDasharray="3 3" vertical={false} />
                    <ReferenceLine y={0} stroke="#6B7280" strokeWidth={2} strokeDasharray="0" />
                    <XAxis
                      dataKey="name"
                      fontSize={11}
                      tick={{ fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis
                      tick={<ColoredYTick />}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmtK}
                      width={68}
                    />
                    <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgba(59,130,246,0.04)" }} />
                    {waterfallFlow.map((line, i) => (
                      <ReferenceLine
                        key={`${line.from}-${line.to}-${i}`}
                        segment={[{ x: line.from, y: line.y }, { x: line.to, y: line.y }]}
                        stroke="#94A3B8"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                    ))}
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {discoveryData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(value: number, _name: string, item: { payload?: { kind?: string } }) => {
                          if (item?.payload?.kind === "impact" && value > 0) return `+${fmtK(value)}`
                          return fmtK(value)
                        }}
                        style={{ fill: "#475569", fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Colorful legend */}
              <div className="flex flex-wrap items-center justify-center gap-8 mt-5 p-4 bg-gradient-to-r from-[#FAFAF9] to-[#F5F5F4] rounded-xl border border-[#E7E5E4]">
                {[
                  { from: "#3B82F6", to: "#60A5FA", label: "Baseline" },
                  { from: "#10B981", to: "#34D399", label: "Positive Impact" },
                  { from: "#EF4444", to: "#F87171", label: "Negative Impact" },
                  { from: "#F59E0B", to: "#FBBF24", label: "Final Predicted Price" },
                ].map(({ from, to, label }) => (
                  <span key={label} className="flex items-center gap-2 text-xs font-medium text-[#57534E]">
                    <span className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} />
                    {label}
                  </span>
                ))}
              </div>

              {/* Detailed waterfall table */}
              <div className="mt-6 rounded-xl overflow-hidden border border-[#E7E5E4]">
                <div className="bg-gradient-to-r from-[#F8FAFF] to-[#FAFAF9] px-5 py-3 border-b border-[#E7E5E4]">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-[#292524]">Price Component Breakdown</h4>
                    <button
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-[#334155] hover:bg-[#F1F5F9] transition-colors"
                      onClick={() => setShowTableDetails((p) => !p)}
                    >
                      {showTableDetails ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showTableDetails ? "Hide details" : "Show details"}
                    </button>
                  </div>
                  <p className="text-xs text-[#78716C]">All factors contributing to the final AI valuation</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E7E5E4]">
                      <th className="text-left px-3 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">#</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Feature</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Type</th>
                      {showTableDetails && (
                        <th className="text-left px-5 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Driver Note</th>
                      )}
                      <th className="text-right px-5 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Impact</th>
                      {showTableDetails && (
                        <th className="text-right px-5 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Share of Move</th>
                      )}
                      <th className="text-right px-5 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Running Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waterfallRows(discoveryData, aiPredictedValue, baselineValue, showTableDetails)}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState label="No price discovery data available." />
          )}
        </div>

        {/* ── Model Adjustment Dropdown ───────────────────────────────────── */}
        {showAdjustment && (
          <div className="border-t border-[#E7E5E4] bg-[#FAFAF9] p-6">
            <div className="flex items-center gap-2 mb-6">
              <FlaskConical className="w-5 h-5 text-[#3B82F6]" />
              <h4 className="text-base font-bold text-[#292524]">Model Adjustment Details</h4>
            </div>

            <div className="rounded-xl border border-[#BFDBFE] bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] p-4 mb-6">
              <h5 className="text-sm font-bold text-[#1E3A8A] mb-3">Adjustment Workflow (Task-by-Task)</h5>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[
                  {
                    step: "1. Baseline calibration",
                    text: `Start from expected market value (${baselineValue > 0 ? fmt(baselineValue) : "N/A"}) estimated from recent comparables.`,
                  },
                  {
                    step: "2. Positive uplift aggregation",
                    text: `Add all positive SHAP feature impacts (${positiveImpact > 0 ? `+${fmt(positiveImpact)}` : "none"}) such as size, location, or condition advantages.`,
                  },
                  {
                    step: "3. Negative drag aggregation",
                    text: `Subtract negative impacts (${negativeImpact < 0 ? fmt(negativeImpact) : "none"}) from risk factors and market frictions.`,
                  },
                  {
                    step: "4. Reconciliation to final price",
                    text: `Combine baseline and all adjustments to produce final AI valuation (${aiPredictedValue > 0 ? fmt(aiPredictedValue) : "N/A"}).`,
                  },
                ].map((item) => (
                  <div key={item.step} className="rounded-lg border border-[#DBEAFE] bg-white p-3">
                    <div className="text-xs font-bold text-[#1D4ED8] mb-1">{item.step}</div>
                    <p className="text-xs text-[#475569] leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary mini-cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#E7E5E4] rounded-xl p-4 shadow-sm">
                <div className="text-xs text-[#78716C] mb-1.5 font-medium">Starting Expected Value</div>
                <div className="text-2xl font-bold text-[#292524]">{baselineValue > 0 ? fmt(baselineValue) : "—"}</div>
                <div className="text-xs text-[#9CA3AF] mt-1">Average market transaction price</div>
              </div>
              <div className="bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] border border-[#86EFAC] rounded-xl p-4 shadow-sm">
                <div className="text-xs text-[#166534] mb-1.5 font-medium">Total Added Value</div>
                <div className="text-2xl font-bold text-[#22C55E]">
                  {positiveImpact > 0 ? `+${fmt(positiveImpact)}` : "—"}
                </div>
                <div className="text-xs text-[#15803D] mt-1">{priceUpDrivers.length} positive factor{priceUpDrivers.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="bg-gradient-to-br from-[#FEF2F2] to-[#FEE2E2] border border-[#FCA5A5] rounded-xl p-4 shadow-sm">
                <div className="text-xs text-[#991B1B] mb-1.5 font-medium">Total Removed Value</div>
                <div className="text-2xl font-bold text-[#EF4444]">
                  {negativeImpact < 0 ? fmt(negativeImpact) : "—"}
                </div>
                <div className="text-xs text-[#B91C1C] mt-1">{priceDownDrivers.length} negative factor{priceDownDrivers.length !== 1 ? "s" : ""}</div>
              </div>
            </div>

            {/* Price Up Drivers */}
            {priceUpDrivers.length > 0 && (
              <div className="mb-5">
                <h5 className="text-sm font-bold text-[#292524] mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#22C55E]" /> Price Up Drivers
                </h5>
                <div className="space-y-2">
                  {priceUpDrivers.map((d, i) => (
                    <div key={i} className="bg-white border border-[#E7E5E4] rounded-xl p-4 flex items-start justify-between hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-7 h-7 rounded-lg bg-[#DCFCE7] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <TrendingUp className="w-3.5 h-3.5 text-[#15803D]" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-[#292524] text-sm mb-0.5">{d.name}</div>
                          <div className="text-xs text-[#78716C] leading-relaxed">{featureDescription(d.name)}</div>
                        </div>
                      </div>
                      <div className="text-base font-bold text-[#22C55E] ml-4 flex-shrink-0">+{fmt(d.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Down Drivers */}
            {priceDownDrivers.length > 0 && (
              <div>
                <h5 className="text-sm font-bold text-[#292524] mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-[#EF4444]" /> Price Down Drivers
                </h5>
                <div className="space-y-2">
                  {priceDownDrivers.map((d, i) => (
                    <div key={i} className="bg-white border border-[#E7E5E4] rounded-xl p-4 flex items-start justify-between hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-7 h-7 rounded-lg bg-[#FEE2E2] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <TrendingDown className="w-3.5 h-3.5 text-[#B91C1C]" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-[#292524] text-sm mb-0.5">{d.name}</div>
                          <div className="text-xs text-[#78716C] leading-relaxed">{featureDescription(d.name)}</div>
                        </div>
                      </div>
                      <div className="text-base font-bold text-[#EF4444] ml-4 flex-shrink-0">{fmt(d.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ 3. MODEL CONSENSUS + FEATURE LEVERAGE ═══════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Model Consensus */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-[#E7E5E4] px-6 py-5">
            <h3 className="text-lg font-bold text-[#292524] mb-1">Model Consensus</h3>
            <p className="text-sm text-[#78716C]">Agreement across prediction algorithms</p>
          </div>
          <div className="p-6">
            {radarData.length >= 3 ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#E7E5E4" />
                      <PolarAngleAxis dataKey="model" tick={{ fill: "#78716C", fontSize: 11 }} />
                      <Radar dataKey="agreement" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2.5} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                        formatter={(v: number) => [`${v}%`, "Agreement"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-between text-sm">
                  <span className="text-[#1E40AF] font-medium">Average R²</span>
                  <span className="text-[#1E3A8A] font-bold">{avgR2.toFixed(3)}</span>
                </div>
              </>
            ) : (
              <EmptyState label="Not enough models for consensus view." />
            )}
          </div>
        </div>

        {/* Feature Leverage — colorful bars */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-[#E7E5E4] px-6 py-5">
            <h3 className="text-lg font-bold text-[#292524] mb-1">Feature Leverage</h3>
            <p className="text-sm text-[#78716C]">Top price-driving characteristics</p>
          </div>
          <div className="p-6">
            {feats.length > 0 ? (
              <>
                <div className="space-y-2.5">
                  {feats.map((f, index) => {
                    const barStyle =
                      f.pct >= 70 ? { from: "#10B981", to: "#34D399" } :
                      f.pct >= 40 ? { from: "#F59E0B", to: "#FBBF24" } :
                                    { from: "#EF4444", to: "#F87171" }
                    return (
                      <div key={f.name} className="bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl p-3 hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 text-xs font-semibold text-[#292524] truncate">{f.name}</div>
                          <div className="text-sm font-bold text-[#292524] min-w-[3rem] text-right">{f.pct}%</div>
                        </div>
                        <div className="w-full bg-[#E7E5E4] rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${f.pct}%`,
                              background: `linear-gradient(90deg, ${barStyle.from}, ${barStyle.to})`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 p-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl flex items-center justify-between text-sm">
                  <span className="text-[#78716C] font-medium">Features shown</span>
                  <span className="text-[#292524] font-bold">{feats.length} of {result.feature_importance?.length ?? 0} total</span>
                </div>
              </>
            ) : (
              <EmptyState label="No feature importance data available." />
            )}
          </div>
        </div>
      </div>

      {/* ══ 4. VALUATION ALERTS ═════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-gradient-to-r from-[#FAFAFA] to-[#F8FAFC] p-4 rounded-2xl border border-[#E5E7EB]">

        {/* Buy signals */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-[#E7E5E4] bg-gradient-to-r from-[#F0FDF4] to-white px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-[#22C55E] rounded-full flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#292524]">Buy Signal Opportunities</h3>
                  <p className="text-xs text-[#78716C]">Undervalued properties</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-[#DCFCE7] rounded-full text-xs font-bold text-[#15803D]">
                {result.arbitrage?.undervalued_count ?? 0}
              </span>
            </div>
          </div>
          <div className="p-5">
            {visibleBuy.length > 0 ? (
              <div className="space-y-3">
                {visibleBuy.map((sig: ArbitrageSignal, i: number) => (
                  <SignalRow key={i} sig={sig} positive />
                ))}
                {buySignals.length > 3 && (
                  <button className="w-full text-xs pt-1 flex items-center justify-center gap-1 text-[#78716C] hover:text-[#292524] transition-colors"
                    onClick={() => setShowAllSignals((p) => !p)}>
                    {showAllSignals ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> +{buySignals.length - 3} more</>}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState label="No buy signals detected." />
            )}
          </div>
        </div>

        {/* Risk signals */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-[#E7E5E4] bg-gradient-to-r from-[#FEF2F2] to-white px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-[#EF4444] rounded-full flex items-center justify-center shadow-lg">
                  <TrendingDown className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#292524]">Risk Alerts</h3>
                  <p className="text-xs text-[#78716C]">Overpriced properties</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-[#FEE2E2] rounded-full text-xs font-bold text-[#B91C1C]">
                {result.arbitrage?.overpriced_count ?? 0}
              </span>
            </div>
          </div>
          <div className="p-5">
            {visibleRisk.length > 0 ? (
              <div className="space-y-3">
                {visibleRisk.map((sig: ArbitrageSignal, i: number) => (
                  <SignalRow key={i} sig={sig} positive={false} />
                ))}
                {riskSignals.length > 3 && (
                  <button className="w-full text-xs pt-1 flex items-center justify-center gap-1 text-[#78716C] hover:text-[#292524] transition-colors"
                    onClick={() => setShowAllSignals((p) => !p)}>
                    {showAllSignals ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> +{riskSignals.length - 3} more</>}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState label="No risk signals detected." />
            )}
          </div>
        </div>
      </div>

      {/* ══ 5. STRATEGY RECOMMENDATION ══════════════════════════════════════ */}
      <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-lg overflow-hidden">
        <div className="border-b border-[#E7E5E4] bg-gradient-to-r from-[#FFFBEB] to-white px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] rounded-xl flex items-center justify-center shadow-sm">
              <Lightbulb className="w-4 h-4 text-[#D97706]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#292524]">Strategy Recommendation</h3>
              <p className="text-xs text-[#78716C]">AI-generated market intelligence based on current dataset</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p
            className="text-sm text-[#57534E] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: strategyHtml }}
          />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { icon: <BookOpen className="w-3.5 h-3.5" />, label: "Winning Model", value: result.winner ?? "—", color: "text-[#292524]" },
              { icon: <Activity className="w-3.5 h-3.5" />, label: "Confidence Score", value: `${safeNum(result.composite_confidence_score).toFixed(0)}%`, color: "text-[#22C55E]" },
              { icon: <Target className="w-3.5 h-3.5" />, label: "Properties Flagged", value: `${(result.arbitrage?.buy_signals?.length ?? 0) + (result.arbitrage?.risk_signals?.length ?? 0)}`, color: "text-[#F59E0B]" },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[#9CA3AF] text-xs mb-1.5">{icon}{label}</div>
                <div className={`text-sm font-bold ${color} truncate`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalRow({ sig, positive }: { sig: ArbitrageSignal; positive: boolean }) {
  const delta    = safeNum(sig.delta_pct)
  const extraVal = safeNum(positive ? sig.potential_gain : sig.potential_loss)
  const Arrow    = positive ? ArrowUpRight : ArrowDownRight

  return (
    <div className="rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
      style={{
        background: positive ? "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)" : "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
        border: `1px solid ${positive ? "#86EFAC" : "#FCA5A5"}`,
      }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: positive ? "#DCFCE7" : "#FEE2E2" }}>
            <Arrow className="w-3.5 h-3.5" style={{ color: positive ? "#15803D" : "#B91C1C" }} />
          </div>
          <span className="text-sm font-semibold text-[#292524]">Property #{sig.property_idx}</span>
        </div>
        <span className="text-sm font-bold px-2 py-0.5 rounded-lg font-mono text-right min-w-[4rem]"
          style={{ color: positive ? "#15803D" : "#B91C1C", background: positive ? "#DCFCE7" : "#FEE2E2" }}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#78716C]">List: {fmt(safeNum(sig.list_price))}</span>
        <span className="text-xs text-[#78716C]">AI: {fmt(safeNum(sig.ai_value))}</span>
      </div>
      {extraVal > 0 && (
        <div className="mt-2 pt-2 border-t flex items-center justify-between"
          style={{ borderColor: positive ? "#86EFAC" : "#FCA5A5" }}>
          <span className="text-xs font-semibold" style={{ color: positive ? "#15803D" : "#B91C1C" }}>
            {positive ? "Potential Gain" : "Estimated Risk"}
          </span>
          <span className="text-sm font-bold" style={{ color: positive ? "#15803D" : "#B91C1C" }}>
            {fmt(extraVal)}
          </span>
        </div>
      )}
      {sig.alert && <p className="text-xs mt-2 text-[#57534E]">{sig.alert}</p>}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Target className="w-6 h-6 text-[#D6D3D1]" />
      <p className="text-sm text-[#A8A29E]">{label}</p>
    </div>
  )
}
