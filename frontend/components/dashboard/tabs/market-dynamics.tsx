"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, Activity, Info, Zap, Target, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrainingResult } from "@/src/types"
import { getMarketIntelligence, type MarketSignal } from "@/src/api"
import { InfoTip } from "@/components/ui/info-tip"

interface MarketDynamicsTabProps {
  result: TrainingResult
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

const ROI_ICONS = [Zap, Target, TrendingUp, Activity] as const

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

export function MarketDynamicsTab({ result }: MarketDynamicsTabProps) {
  const market = useMarketDynamics(result)
  const [aiSignals, setAiSignals] = useState<MarketSignal[]>([])
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
      .then((data) => { if (data?.signals) setAiSignals(data.signals) })
      .catch(() => {})
      .finally(() => setSignalsLoading(false))
  }, [result])

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
