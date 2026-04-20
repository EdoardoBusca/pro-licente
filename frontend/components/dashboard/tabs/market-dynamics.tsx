"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, Activity, Info, Zap, Target } from "lucide-react"
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
    <div className="space-y-8">
      {/* Liquidity Overview */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <p className="text-sm text-[#64748B]">Market Liquidity</p>
            <h2 className="text-2xl font-semibold text-[#0F172A] mt-1">{market.liquidity.marketLabel}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
            <div className="rounded-lg border border-gray-100 bg-[#F8FAFC] px-4 py-3 min-w-[170px]">
              <p className="text-xs uppercase tracking-wide text-[#64748B] flex items-center">Liquidity Score<InfoTip text="How quickly properties sell in this market, scored 1–99. Higher = more buyer competition and faster absorption. Derived from days-on-market data in your dataset." /></p>
              <p className="text-3xl font-bold text-[#0F172A] mt-1">{market.liquidity.score}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-[#F8FAFC] px-4 py-3 min-w-[170px]">
              <p className="text-xs uppercase tracking-wide text-[#64748B] flex items-center">Expected Time to Sale<InfoTip text="AI estimate of days from listing to contract, based on historical sales velocity patterns in your dataset." /></p>
              <p className="text-2xl font-semibold text-[#0F172A] mt-1">
                {market.liquidity.expectedDaysToSell !== null ? `${market.liquidity.expectedDaysToSell} days` : "N/A"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section A: ROI Enhancement */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#334155]" />
          <h3 className="text-lg font-semibold text-[#0F172A] flex items-center">ROI Enhancement Opportunities<InfoTip text="Feature combinations (e.g. location × bedroom count) that historically correlate with above-average sale prices in your dataset. The % lift is the estimated price premium." /></h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {market.roiSynergies.length > 0 ? market.roiSynergies.map((item, index) => {
            const Icon = ROI_ICONS[index % ROI_ICONS.length]
            return (
              <div key={item.id} className="rounded-xl border border-gray-100 bg-[#ebfcf5] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white/70 border border-gray-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[#166534]" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-[#64748B]">Est. Lift</div>
                    <div className="text-2xl font-semibold text-[#14532D]">+{item.estLiftPct.toFixed(1)}%</div>
                  </div>
                </div>
                <p className="mt-6 text-base font-medium text-[#1E293B] leading-snug">{item.label}</p>
              </div>
            )
          }) : (
            <div className="col-span-full rounded-xl border border-gray-100 bg-white p-6 text-base text-[#64748B]">
              No ROI synergy data available.
            </div>
          )}
        </div>
      </section>

      {/* Section B: Lead-Lag Market Intelligence */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2 mb-5">
          <Activity className="w-5 h-5 text-[#334155]" />
          <h3 className="text-lg font-semibold text-[#0F172A] flex items-center">Lead-Lag Market Intelligence<InfoTip text="Economic and behavioural signals that tend to move before property prices change. Lag days = how far ahead this signal predicts. Generated by AI from your dataset context." /></h3>
          <span className="ml-auto text-xs text-[#94A3B8] flex items-center gap-1">AI-generated</span>
        </div>
        <div className="space-y-4">
          {signalsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-[#FAFCFF] p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
                  <div className="h-2.5 bg-gray-200 rounded-full w-full" />
                </div>
              ))}
            </div>
          ) : aiSignals.length > 0 ? aiSignals.map((signal, i) => {
            const strength = Math.min(100, Math.round(signal.correlation * 100))
            return (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4 items-center rounded-lg border border-gray-100 bg-[#FAFCFF] p-4">
                <div>
                  <p className="text-base font-semibold text-[#0F172A]">{signal.name}</p>
                  <p className="text-sm text-[#64748B] mt-1">
                    Lag: <span className="font-medium text-[#334155]">{signal.lag_days} days</span>
                    <span className="mx-2">•</span>
                    Correlation: <span className="font-medium text-[#334155]">{signal.correlation.toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1.5">{signal.description}</p>
                </div>
                <div className="justify-self-end w-full max-w-[240px]">
                  <div className="h-2.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
                    <div className="h-full rounded-full bg-[#334155]" style={{ width: `${strength}%` }} />
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1 text-right">{strength}% signal strength</p>
                </div>
              </div>
            )
          }) : (
            <div className="rounded-lg border border-gray-100 p-4 text-base text-[#64748B]">No signal data available.</div>
          )}
        </div>
      </section>

      {/* Section C: Scenario Simulator */}
      <section className="rounded-xl border border-[#FDE68A] bg-gradient-to-br from-[#FFF9E8] to-[#FFF4CC] p-6 shadow-[0_4px_14px_rgba(146,64,14,0.08)]">
        <h3 className="text-lg font-semibold text-[#78350F] mb-5 flex items-center">Scenario Simulator<InfoTip text="Adjust renovation spend and market conditions to model how they affect expected property value. Drag the slider from Conservative to Aggressive to simulate different market stances." /></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#92400E] mb-1.5">
              Renovation Package
            </label>
            <select
              value={renovationPackage}
              onChange={(e) => setRenovationPackage(e.target.value as RenovationPackage)}
              className="w-full rounded-lg border border-[#FCD34D] bg-white px-3 py-2.5 text-sm text-[#78350F]"
            >
              <option value="basic">Basic Refresh</option>
              <option value="midrange">Mid-Range Modernization</option>
              <option value="luxury">Luxury Upgrade</option>
              <option value="structural">Structural Rehab</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#92400E] mb-1.5">
              Forecast Horizon
            </label>
            <select
              value={forecastHorizonMonths}
              onChange={(e) => setForecastHorizonMonths(Number(e.target.value))}
              className="w-full rounded-lg border border-[#FCD34D] bg-white px-3 py-2.5 text-sm text-[#78350F]"
            >
              <option value={6}>6 months</option>
              <option value={12}>1 year</option>
              <option value={60}>5 years</option>
              <option value={120}>10 years</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-stretch">
          <div className="rounded-lg border border-[#FDE68A] bg-white/70 p-5">
            <div className="flex items-center justify-between text-sm text-[#92400E] mb-2">
              <span>Conservative</span>
              <span>Balanced</span>
              <span>Aggressive</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full accent-[#B45309]"
            />
            <div className="mt-4 text-base text-[#78350F]">
              Scenario position: <span className="font-semibold">{sliderValue}</span>
              {isSimulating && <span className="ml-2 text-sm text-[#92400E]">Updating...</span>}
            </div>
          </div>

          <div className="rounded-lg border border-[#A16207] bg-[#78350F] p-5 text-white flex flex-col justify-center">
            <p className="text-sm uppercase tracking-wide text-amber-200">Adjusted Valuation</p>
            <p className="text-4xl font-bold mt-1">{fmtCurrency(adjustedValuation)}</p>
            <p className="text-sm text-amber-100 mt-3 leading-relaxed">{conditionImpact}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-[#FCD34D] bg-white/70 px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-[#92400E]">Position</p>
          <p className="text-base font-semibold text-[#78350F]">{sliderPosition} ({sliderValue})</p>
        </div>

        <div className="mt-4 rounded-lg border border-[#FCD34D] bg-white/70 px-4 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#92400E]">Renovation Cost</p>
            <p className="text-base font-semibold text-[#78350F]">{fmtCurrency(renovationCost)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#92400E]">Expected Value Gain</p>
            <p className="text-base font-semibold text-[#78350F]">{fmtCurrency(expectedValueGain)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#92400E]">Projected Profit</p>
            <p className={`text-base font-semibold ${projectedProfit >= 0 ? "text-[#166534]" : "text-[#991B1B]"}`}>
              {projectedProfit >= 0 ? "+" : ""}{fmtCurrency(projectedProfit)}
            </p>
          </div>
        </div>
      </section>

      {/* Section D: Summary */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-[#64748B]" />
          <h3 className="text-lg font-semibold text-[#0F172A]">AI Market Summary</h3>
        </div>
        <p className="text-base leading-relaxed text-[#334155]">{market.marketSummary}</p>
      </section>
    </div>
  )
}
