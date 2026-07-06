"use client"

import { useMemo, useState } from "react"
import {
  DollarSign, Percent, Home, TrendingUp, ShieldCheck,
  AlertTriangle, CheckCircle2, Info, Calculator, BarChart3,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTip } from "@/components/ui/info-tip"
import type { TrainingResult } from "@/src/types"
import { calcMortgage, getDefaultPrice } from "@/src/finance"
import { fmt, fmtPct } from "@/lib/format"

interface InvestmentCalculatorTabProps {
  result: TrainingResult
}

type DealRating = { label: string; color: string; bg: string; icon: typeof CheckCircle2 }

function getDealRating(capRate: number, coc: number, dscr: number): DealRating {
  const score = (capRate >= 8 ? 2 : capRate >= 5 ? 1 : 0)
    + (coc >= 10 ? 2 : coc >= 6 ? 1 : 0)
    + (dscr >= 1.25 ? 2 : dscr >= 1.0 ? 1 : 0)
  if (score >= 5) return { label: "Excellent Deal", color: "#14532D", bg: "#dcfce7", icon: CheckCircle2 }
  if (score >= 3) return { label: "Good Deal", color: "#166534", bg: "#f0fdf4", icon: TrendingUp }
  if (score >= 1) return { label: "Marginal Deal", color: "#92400E", bg: "#fef3c7", icon: AlertTriangle }
  return { label: "Poor Deal", color: "#991B1B", bg: "#fef2f2", icon: AlertTriangle }
}

interface NumberInputProps {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  step?: number
  min?: number
  max?: number
}

function NumberInput({ label, value, onChange, prefix, suffix, step = 1, min = 0, max }: NumberInputProps) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden focus-within:ring-1 focus-within:ring-foreground/20 transition-all">
        {prefix && (
          <span className="px-3 text-sm text-muted-foreground border-r border-border bg-muted/40 select-none">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none min-w-0"
        />
        {suffix && (
          <span className="px-3 text-sm text-muted-foreground border-l border-border bg-muted/40 select-none">{suffix}</span>
        )}
      </div>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  accent?: string
  bg?: string
  tip?: string
}

function MetricCard({ label, value, sub, accent, bg, tip }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
        {label}
        {tip && <InfoTip text={tip} side="bottom" />}
      </p>
      <p className="text-2xl font-bold mt-1.5 text-foreground" style={accent ? { color: accent } : undefined}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export function InvestmentCalculatorTab({ result }: InvestmentCalculatorTabProps) {
  const defaultPrice = useMemo(() => getDefaultPrice(result), [result])

  const [propertyPrice, setPropertyPrice] = useState(defaultPrice)
  const [downPaymentPct, setDownPaymentPct] = useState(20)
  const [interestRate, setInterestRate] = useState(7.0)
  const [loanTermYears, setLoanTermYears] = useState(30)
  const [monthlyRent, setMonthlyRent] = useState(Math.round(defaultPrice * 0.007))
  const [vacancyRate, setVacancyRate] = useState(5)
  const [monthlyExpenses, setMonthlyExpenses] = useState(Math.round(defaultPrice * 0.001))

  const metrics = useMemo(() => {
    const downPayment   = propertyPrice * (downPaymentPct / 100)
    const loanAmount    = propertyPrice - downPayment
    const monthlyMortgage = calcMortgage(loanAmount, interestRate, loanTermYears)
    const annualDebtService = monthlyMortgage * 12

    const effectiveGrossIncome = monthlyRent * 12 * (1 - vacancyRate / 100)
    const annualExpenses = monthlyExpenses * 12
    const noi = effectiveGrossIncome - annualExpenses
    const annualCashFlow = noi - annualDebtService

    const capRate = propertyPrice > 0 ? (noi / propertyPrice) * 100 : 0
    const coc = downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 0
    const grm = monthlyRent > 0 ? propertyPrice / (monthlyRent * 12) : 0
    const grossYield = propertyPrice > 0 ? ((monthlyRent * 12) / propertyPrice) * 100 : 0
    const breakEvenRent = ((monthlyMortgage + monthlyExpenses) / (1 - vacancyRate / 100))

    return {
      downPayment, loanAmount, monthlyMortgage, annualDebtService,
      noi, annualCashFlow, effectiveGrossIncome, annualExpenses,
      capRate, coc, dscr, grm, grossYield, breakEvenRent,
    }
  }, [propertyPrice, downPaymentPct, interestRate, loanTermYears, monthlyRent, vacancyRate, monthlyExpenses])

  const rating = getDealRating(metrics.capRate, metrics.coc, metrics.dscr)
  const RatingIcon = rating.icon

  return (
    <div className="space-y-6">

      {/* ── Hero: Deal Rating Banner ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <RatingIcon className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">Deal Assessment</p>
              <h2 className="text-2xl font-semibold mb-3">{rating.label}</h2>
              <p className="text-sm text-background/60">Based on Cap Rate, CoC Return, and DSCR</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 shrink-0">
            {[
              { label: "Cap Rate",   value: fmtPct(metrics.capRate),      highlight: metrics.capRate >= 8,   tip: "Net Operating Income ÷ Purchase Price. Target ≥ 8%." },
              { label: "CoC Return", value: fmtPct(metrics.coc),          highlight: metrics.coc >= 10,      tip: "Cash-on-Cash: annual cash flow ÷ down payment. Target ≥ 10%." },
              { label: "DSCR",       value: `${metrics.dscr.toFixed(2)}x`, highlight: metrics.dscr >= 1.25, tip: "NOI ÷ annual mortgage payments. Target ≥ 1.25x." },
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

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* ── Left: Inputs ── */}
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Property</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberInput label="Purchase Price" value={propertyPrice} onChange={setPropertyPrice} prefix="$" step={1000} />
              <NumberInput label="Down Payment" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" step={0.5} min={0} max={100} />
              <div className="flex justify-between text-xs text-muted-foreground -mt-2 px-1">
                <span>Down: {fmt(propertyPrice * downPaymentPct / 100)}</span>
                <span>Loan: {fmt(propertyPrice * (1 - downPaymentPct / 100))}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Financing</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberInput label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.125} min={0} />
              <NumberInput label="Loan Term" value={loanTermYears} onChange={setLoanTermYears} suffix="years" step={5} min={5} max={30} />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Income &amp; Expenses</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberInput label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" step={50} />
              <NumberInput label="Vacancy Rate" value={vacancyRate} onChange={setVacancyRate} suffix="%" step={0.5} min={0} max={50} />
              <NumberInput label="Monthly Operating Expenses" value={monthlyExpenses} onChange={setMonthlyExpenses} prefix="$" step={50} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Include property tax, insurance, maintenance, property management, HOA, etc.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Metrics ── */}
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Mortgage Breakdown</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Monthly Payment"   value={fmt(metrics.monthlyMortgage)}    sub="P&I only" />
                <MetricCard label="Monthly Cash Flow" value={fmt(metrics.annualCashFlow / 12)} sub="After all costs"
                  accent={metrics.annualCashFlow >= 0 ? "#10B981" : "#EF4444"} />
                <MetricCard label="Annual NOI"        value={fmt(metrics.noi)}                 sub="Before debt service" tip="Net Operating Income: effective gross income minus operating expenses, before mortgage payments." />
                <MetricCard label="Break-even Rent"   value={fmt(metrics.breakEvenRent)}       sub="Vacancy-adjusted" tip="Minimum monthly rent to cover all costs at your vacancy rate." />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Investment Ratios</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  {
                    label: "Cap Rate", value: fmtPct(metrics.capRate), target: "≥ 8%",
                    badge: metrics.capRate >= 8 ? "Strong" : metrics.capRate >= 5 ? "Fair" : "Weak",
                    badgeCls: metrics.capRate >= 8 ? "bg-emerald-50 text-emerald-700" : metrics.capRate >= 5 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                    bar: Math.min(100, metrics.capRate * 7), barColor: "#3B82F6",
                  },
                  {
                    label: "Cash-on-Cash", value: fmtPct(metrics.coc), target: "≥ 10%",
                    badge: metrics.coc >= 10 ? "Strong" : metrics.coc >= 6 ? "Fair" : "Weak",
                    badgeCls: metrics.coc >= 10 ? "bg-emerald-50 text-emerald-700" : metrics.coc >= 6 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                    bar: Math.min(100, metrics.coc * 5), barColor: "#10B981",
                  },
                  {
                    label: "DSCR", value: metrics.dscr < 0 ? "Negative" : `${metrics.dscr.toFixed(2)}x`, target: "≥ 1.25x",
                    badge: metrics.dscr >= 1.25 ? "Safe" : metrics.dscr >= 1.0 ? "Break-even" : "Risk",
                    badgeCls: metrics.dscr >= 1.25 ? "bg-emerald-50 text-emerald-700" : metrics.dscr >= 1.0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                    bar: Math.min(100, metrics.dscr * 50), barColor: "#F59E0B",
                  },
                ].map(({ label, value, target, badge, badgeCls, bar, barColor }) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeCls}`}>{badge}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${bar}%`, background: barColor }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Target: {target}</p>
                  </div>
                ))}
                {[
                  { label: "Gross Rent Multiplier", value: `${metrics.grm.toFixed(1)}x`, sub: "Lower is better (target: < 12x)", tip: "Purchase Price ÷ Annual Gross Rent." },
                  { label: "Gross Yield",           value: fmtPct(metrics.grossYield),    sub: "Annual rent / price" },
                  { label: "LTV Ratio",             value: fmtPct(100 - downPaymentPct, 0), sub: downPaymentPct >= 20 ? "No PMI required" : "PMI likely required" },
                ].map(({ label, value, sub, tip }) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center">
                      {label}{tip && <InfoTip text={tip} side="bottom" />}
                    </p>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Annual P&amp;L Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[
                  { label: "Gross Rental Income",       value: fmt(monthlyRent * 12),                           sign: "+", accent: "text-emerald-600" },
                  { label: `Vacancy Loss (${vacancyRate}%)`,  value: fmt(-monthlyRent * 12 * vacancyRate / 100), sign: "−", accent: "text-red-500" },
                  { label: "Effective Gross Income",    value: fmt(metrics.effectiveGrossIncome),                sign: "",  accent: "text-foreground", bold: true },
                  { label: "Operating Expenses",        value: fmt(-metrics.annualExpenses),                     sign: "−", accent: "text-red-500" },
                  { label: "Net Operating Income",      value: fmt(metrics.noi),                                 sign: "",  accent: "text-foreground", bold: true },
                  { label: "Annual Debt Service",       value: fmt(-metrics.annualDebtService),                  sign: "−", accent: "text-red-500" },
                  { label: "Annual Cash Flow",          value: fmt(metrics.annualCashFlow),                      sign: "",  accent: metrics.annualCashFlow >= 0 ? "text-emerald-600" : "text-red-500", bold: true },
                ].map(({ label, value, sign, accent, bold }, i) => (
                  <div key={label} className={`flex items-center justify-between py-2 ${bold ? "border-t border-dashed border-border mt-1 pt-3" : ""}`}>
                    <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                    <span className={`text-sm font-semibold ${accent}`}>{sign} {value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-muted/40 px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Purchase price pre-filled from your AI valuation. Adjust all inputs to model your specific deal.
              DSCR ≥ 1.25 is typically required for investment property loans.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
