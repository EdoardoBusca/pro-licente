"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, Activity, Info, Zap, Target, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrainingResult } from "@/src/types"
import { getMarketIntelligence } from "@/src/api"
import { InfoTip } from "@/components/ui/info-tip"

type RenovationPackage = "basic" | "midrange" | "luxury" | "structural"

interface MarketDynamicsTabProps {
  result: TrainingResult
  onSliderChange?: (payload: {
    sliderValue: number
    renovationPackage: RenovationPackage
    forecastHorizonMonths: number
    baseValuation: number
    marketCycle: string
  }) => Promise<{
    adjustedValuation: number
    conditionImpact: string
    renovationCost?: number
    expectedValueGain?: number
    projectedProfit?: number
  }>
}

interface MarketData {
  roiSynergies: {
    id: string
    label: string
    estLiftPct: number
  }[]
  marketSummary: string
  baseValuation: number
  liquidity: {
    score: number
    expectedDaysToSell: number | null
    marketLabel: string
  }
}

interface AiSignal {
  name: string
  lag_days: number
  correlation: number
  description: string
}

const ROI_ICONS = [Zap, Target, TrendingUp, Activity] as const

const RENOVATION_PACKAGES: Record<RenovationPackage, {
  label: string
  cost: number
  gainPct: number
}> = {
  basic: { label: "Basic Refresh", cost: 18000, gainPct: 0.05 },
  midrange: { label: "Mid-Range Modernization", cost: 42000, gainPct: 0.09 },
  luxury: { label: "Luxury Upgrade", cost: 95000, gainPct: 0.11 },
  structural: { label: "Structural Rehab", cost: 140000, gainPct: 0.07 },
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

function useMarketDynamics(result: TrainingResult): MarketData {
  return useMemo(() => {
    const synergies = (result.market_dynamics?.roi_heatmap ?? []).slice(0, 4).map((row, index) => ({
      id: `${row.feature_x}-${row.feature_y}-${index}`,
      label: `${row.feature_x.replace(/_/g, " ")} × ${row.feature_y.replace(/_/g, " ")}`,
      estLiftPct: Number(row.sales_lift ?? 0),
    }))

    const baseValuation = Number(
      result.market_dynamics?.price_discovery?.find((d) => d.kind === "final")?.change
      ?? result.projection?.[result.projection.length - 1]?.val
      ?? 0,
    )

    const summaryText = result.market_dynamics?.sales_velocity?.narrative?.trim()
      || `Market cycle: ${result.market_dynamics?.temporal_analysis?.market_cycle ?? "Balanced"}. AI confidence remains ${Math.round(result.composite_confidence_score ?? 0)}%.`

    const liquidity = {
      score: Math.min(99, Math.max(1, Math.round(Number(result.market_dynamics?.sales_velocity?.liquidity_score ?? 0)))),
      expectedDaysToSell: result.market_dynamics?.sales_velocity?.expected_days_to_sell ?? null,
      marketLabel: result.market_dynamics?.sales_velocity?.market_label || "Market liquidity signal",
    }

    return {
      roiSynergies: synergies,
      marketSummary: summaryText,
      baseValuation,
      liquidity,
    }
  }, [result])
}

export function MarketDynamicsTab({ result, onSliderChange }: MarketDynamicsTabProps) {
  const market = useMarketDynamics(result)
  const [sliderValue, setSliderValue] = useState(50)
  const [renovationPackage, setRenovationPackage] = useState<RenovationPackage>("basic")
  const [forecastHorizonMonths, setForecastHorizonMonths] = useState(12)
  const [adjustedValuation, setAdjustedValuation] = useState(market.baseValuation)
  const [conditionImpact, setConditionImpact] = useState("Move the slider to simulate market conditions.")
  const [renovationCost, setRenovationCost] = useState(RENOVATION_PACKAGES.basic.cost)
  const [expectedValueGain, setExpectedValueGain] = useState(market.baseValuation * RENOVATION_PACKAGES.basic.gainPct)
  const [projectedProfit, setProjectedProfit] = useState((market.baseValuation * RENOVATION_PACKAGES.basic.gainPct) - RENOVATION_PACKAGES.basic.cost)
  const [isSimulating, setIsSimulating] = useState(false)
  const [aiSignals, setAiSignals] = useState<AiSignal[]>([])
  const [signalsLoading, setSignalsLoading] = useState(false)

  useEffect(() => {
    setSignalsLoading(true)
    const md = result.market_dynamics
    const yoyMetrics = md?.temporal_analysis?.yoy_appreciation_metrics ?? []
    const avgYoy = yoyMetrics.length > 0
      ? yoyMetrics.reduce((sum, m) => sum + Number(m.yoy_appreciation ?? 0), 0) / yoyMetrics.length
      : 0
    const corrKeys = Object.keys(result.correlation_lookup ?? {})
    const locations = corrKeys
      .filter((k) => k.startsWith("Zip_Code_"))
      .map((k) => k.replace("Zip_Code_", ""))
      .slice(0, 8)
    const propertyTypes = corrKeys
      .filter((k) => k.startsWith("Property_Type_"))
      .map((k) => k.replace("Property_Type_", ""))
      .slice(0, 6)
    const avgPrice = Number(
      md?.price_discovery?.find((d) => d.kind === "final")?.change
      ?? result.projection?.[result.projection.length - 1]?.val
      ?? 0,
    )
    getMarketIntelligence({
      market_cycle: md?.temporal_analysis?.market_cycle ?? "Balanced",
      yoy_appreciation: avgYoy,
      liquidity_score: Number(md?.sales_velocity?.liquidity_score ?? 0),
      avg_price: avgPrice,
      locations,
      property_types: propertyTypes,
      total_rows: Number(result.data_quality?.total_rows ?? 0),
      expected_days_to_sell: md?.sales_velocity?.expected_days_to_sell ?? null,
      mape: Number(result.mape ?? 0),
      r2: Number(result.r2_score ?? 0),
    })
      .then((data: { signals?: AiSignal[] }) => { if (data?.signals) setAiSignals(data.signals) })
      .catch(() => {})
      .finally(() => setSignalsLoading(false))
  }, [result])

  useEffect(() => {
    setAdjustedValuation(market.baseValuation)
    const selected = RENOVATION_PACKAGES[renovationPackage]
    const expectedGain = market.baseValuation * selected.gainPct
    setRenovationCost(selected.cost)
    setExpectedValueGain(expectedGain)
    setProjectedProfit(expectedGain - selected.cost)
  }, [market.baseValuation, renovationPackage])

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!onSliderChange) {
        setAdjustedValuation(market.baseValuation)
        setConditionImpact("Connect onSliderChange service for live valuation simulation.")
        return
      }

      try {
        setIsSimulating(true)
        const response = await onSliderChange({
          sliderValue,
          renovationPackage,
          forecastHorizonMonths,
          baseValuation: market.baseValuation,
          marketCycle: result.market_dynamics?.temporal_analysis?.market_cycle ?? "Balanced",
        })
        setAdjustedValuation(Number(response.adjustedValuation ?? market.baseValuation))
        setConditionImpact(response.conditionImpact || "Scenario updated from backend service.")
        if (typeof response.renovationCost === "number") setRenovationCost(response.renovationCost)
        if (typeof response.expectedValueGain === "number") setExpectedValueGain(response.expectedValueGain)
        if (typeof response.projectedProfit === "number") setProjectedProfit(response.projectedProfit)
      } catch {
        setAdjustedValuation(market.baseValuation)
        setConditionImpact("Scenario service unavailable. Showing base valuation.")
      } finally {
        setIsSimulating(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [sliderValue, renovationPackage, forecastHorizonMonths, onSliderChange, market.baseValuation, result.market_dynamics?.temporal_analysis?.market_cycle])

  const sliderPosition = sliderValue < 34 ? "Conservative" : sliderValue < 67 ? "Balanced" : "Aggressive"

  return (
    <div className="space-y-6">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">Market Intelligence</p>
              <h2 className="text-2xl font-semibold mb-3">{market.liquidity.marketLabel}</h2>
              <div className="flex items-center gap-2 text-sm text-background/60">
                <Activity className="w-4 h-4" />
                <span>{market.marketSummary.slice(0, 80)}{market.marketSummary.length > 80 ? "…" : ""}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 shrink-0">
            {[
              { label: "Liquidity Score", value: String(market.liquidity.score),                                              highlight: true, tip: "How quickly properties sell, scored 1–99." },
              { label: "Time to Sell",    value: market.liquidity.expectedDaysToSell !== null ? `${market.liquidity.expectedDaysToSell}d` : "N/A", tip: "AI estimate of days from listing to contract." },
              { label: "Base Valuation",  value: market.baseValuation > 0 ? `$${(market.baseValuation / 1000).toFixed(0)}K` : "—",              tip: "AI-estimated market value." },
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

      {/* ── ROI Enhancement ──────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-1">
            ROI Enhancement Opportunities
            <InfoTip text="Feature combinations that historically correlate with above-average sale prices. The % lift is the estimated price premium." />
          </CardTitle>
          <p className="text-sm text-muted-foreground">High-value property attribute combinations</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {market.roiSynergies.length > 0 ? market.roiSynergies.map((item, index) => {
              const Icon = ROI_ICONS[index % ROI_ICONS.length]
              return (
                <div key={item.id} className="rounded-xl bg-emerald-50 border border-emerald-100 p-5">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-lg bg-white border border-emerald-100 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Est. Lift</div>
                      <div className="text-2xl font-semibold text-emerald-700">+{item.estLiftPct.toFixed(1)}%</div>
                    </div>
                  </div>
                  <p className="mt-5 text-sm font-medium text-foreground leading-snug">{item.label}</p>
                </div>
              )
            }) : (
              <div className="col-span-full text-sm text-muted-foreground py-6 text-center">No ROI synergy data available.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Lead-Lag Market Intelligence ─────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-1">
                Lead-Lag Market Intelligence
                <InfoTip text="Economic signals that tend to move before property prices change. Lag days = how far ahead this signal predicts." />
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">AI-generated forward indicators</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">AI-generated</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {signalsLoading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl bg-muted/40 p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-2/3 mb-3" />
                  <div className="h-2 bg-muted rounded-full w-full" />
                </div>
              ))
            ) : aiSignals.length > 0 ? aiSignals.map((signal, i) => {
              const strength = Math.min(100, Math.round(signal.correlation * 100))
              return (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4 items-center rounded-xl bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{signal.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lag: <span className="font-medium text-foreground">{signal.lag_days} days</span>
                      <span className="mx-2">·</span>
                      Correlation: <span className="font-medium text-foreground">{signal.correlation.toFixed(2)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">{signal.description}</p>
                  </div>
                  <div>
                    <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-foreground" style={{ width: `${strength}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{strength}% signal strength</p>
                  </div>
                </div>
              )
            }) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No signal data available.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Scenario Simulator ───────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-1">
            Scenario Simulator
            <InfoTip text="Adjust renovation spend and market conditions to model how they affect expected property value." />
          </CardTitle>
          <p className="text-sm text-muted-foreground">Model different renovation and market scenarios</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Renovation Package</label>
              <select
                value={renovationPackage}
                onChange={(e) => setRenovationPackage(e.target.value as RenovationPackage)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <option value="basic">Basic Refresh</option>
                <option value="midrange">Mid-Range Modernization</option>
                <option value="luxury">Luxury Upgrade</option>
                <option value="structural">Structural Rehab</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Forecast Horizon</label>
              <select
                value={forecastHorizonMonths}
                onChange={(e) => setForecastHorizonMonths(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <option value={6}>6 months</option>
                <option value={12}>1 year</option>
                <option value={60}>5 years</option>
                <option value={120}>10 years</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="rounded-xl bg-muted/40 p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Conservative</span><span>Balanced</span><span>Aggressive</span>
              </div>
              <input type="range" min={0} max={100} value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="w-full accent-foreground" />
              <div className="mt-3 text-sm text-muted-foreground">
                Position: <span className="font-semibold text-foreground">{sliderPosition}</span>
                {isSimulating && <span className="ml-2 text-xs">Updating…</span>}
              </div>
            </div>

            <div className="rounded-xl bg-foreground text-background p-5 flex flex-col justify-center">
              <p className="text-xs text-background/60 uppercase tracking-wide mb-1">Adjusted Valuation</p>
              <p className="text-3xl font-bold tabular-nums">{fmtCurrency(adjustedValuation)}</p>
              <p className="text-xs text-background/60 mt-2 leading-relaxed">{conditionImpact}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Renovation Cost",     value: fmtCurrency(renovationCost) },
              { label: "Expected Value Gain", value: fmtCurrency(expectedValueGain) },
              { label: "Projected Profit",    value: (projectedProfit >= 0 ? "+" : "") + fmtCurrency(projectedProfit), positive: projectedProfit >= 0 },
            ].map(({ label, value, positive }) => (
              <div key={label} className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-sm font-semibold ${positive === true ? "text-emerald-600" : positive === false ? "text-red-500" : "text-foreground"}`}>{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── AI Market Summary ────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-lg font-semibold">AI Market Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{market.marketSummary}</p>
        </CardContent>
      </Card>
    </div>
  )
}
