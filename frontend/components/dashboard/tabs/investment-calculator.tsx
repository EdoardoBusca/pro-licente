"use client"

import { useMemo, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Legend,
} from "recharts"
import {
  DollarSign, Percent, Home, TrendingUp, ShieldCheck,
  AlertTriangle, CheckCircle2, Info, Calculator, Building2, PiggyBank,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTip } from "@/components/ui/info-tip"
import type { TrainingResult } from "@/src/types"
import { calcMortgage, calcRemainingBalance, calcIRR, getDefaultPrice, getDefaultAppreciation } from "@/src/finance"
import { fmt, fmtK, fmtPct } from "@/lib/format"

interface InvestmentCalculatorTabProps {
  result: TrainingResult
}

// ─── Deal rating ──────────────────────────────────────────────────────────────

function getDealRating(capRate: number, coc: number, dscr: number) {
  const score = (capRate >= 8 ? 2 : capRate >= 5 ? 1 : 0)
    + (coc >= 10 ? 2 : coc >= 6 ? 1 : 0)
    + (dscr >= 1.25 ? 2 : dscr >= 1.0 ? 1 : 0)
  if (score >= 5) return { label: "Excellent Deal", icon: CheckCircle2 }
  if (score >= 3) return { label: "Good Deal", icon: TrendingUp }
  if (score >= 1) return { label: "Marginal Deal", icon: AlertTriangle }
  return { label: "Poor Deal", icon: AlertTriangle }
}

// ─── Multi-year projection ────────────────────────────────────────────────────

interface ProjectionRow {
  year: number
  propertyValue: number
  loanBalance: number
  equity: number
  noi: number
  cashFlow: number
  cumulativeCashFlow: number
}

function buildProjection(
  propertyPrice: number,
  downPaymentPct: number,
  interestRate: number,
  loanTermYears: number,
  monthlyRent: number,
  vacancyRate: number,
  monthlyExpenses: number,
  appreciationRate: number,
  rentGrowthRate: number,
  expenseGrowthRate: number,
  projectionYears: number,
): ProjectionRow[] {
  const downPayment = propertyPrice * (downPaymentPct / 100)
  const loanAmount = propertyPrice - downPayment
  const monthlyMortgage = calcMortgage(loanAmount, interestRate, loanTermYears)
  const annualDebtService = monthlyMortgage * 12
  let cumulativeCashFlow = -downPayment
  const rows: ProjectionRow[] = []

  for (let year = 1; year <= projectionYears; year++) {
    const propertyValue = propertyPrice * Math.pow(1 + appreciationRate / 100, year)
    const loanBalance = year >= loanTermYears ? 0 : calcRemainingBalance(loanAmount, interestRate, loanTermYears, year)
    const equity = propertyValue - loanBalance
    const yearlyRent = monthlyRent * 12 * Math.pow(1 + rentGrowthRate / 100, year - 1)
    const effectiveIncome = yearlyRent * (1 - vacancyRate / 100)
    const yearlyExpenses = monthlyExpenses * 12 * Math.pow(1 + expenseGrowthRate / 100, year - 1)
    const noi = effectiveIncome - yearlyExpenses
    const cashFlow = noi - (year <= loanTermYears ? annualDebtService : 0)
    cumulativeCashFlow += cashFlow

    rows.push({ year, propertyValue, loanBalance, equity, noi, cashFlow, cumulativeCashFlow })
  }
  return rows
}

// ─── Shared inputs ────────────────────────────────────────────────────────────

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
  tip?: string
}

function MetricCard({ label, value, sub, accent, tip }: MetricCardProps) {
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

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 text-xs bg-card border border-border shadow-xl">
      <p className="font-semibold mb-2 text-foreground">Year {label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold text-foreground">{fmtK(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function InvestmentCalculatorTab({ result }: InvestmentCalculatorTabProps) {
  const defaultPrice = useMemo(() => getDefaultPrice(result), [result])
  const defaultAppreciation = useMemo(() => getDefaultAppreciation(result), [result])

  // One shared deal — feeds both the year-1 ratios and the long-term projection
  const [propertyPrice, setPropertyPrice] = useState(defaultPrice)
  const [downPaymentPct, setDownPaymentPct] = useState(20)
  const [interestRate, setInterestRate] = useState(7.0)
  const [loanTermYears, setLoanTermYears] = useState(30)
  const [monthlyRent, setMonthlyRent] = useState(Math.round(defaultPrice * 0.007))
  const [vacancyRate, setVacancyRate] = useState(5)
  const [monthlyExpenses, setMonthlyExpenses] = useState(Math.round(defaultPrice * 0.001))
  const [appreciationRate, setAppreciationRate] = useState(defaultAppreciation)
  const [rentGrowthRate, setRentGrowthRate] = useState(2.5)
  const [expenseGrowthRate, setExpenseGrowthRate] = useState(3.0)
  const [projectionYears, setProjectionYears] = useState(10)

  // ── Year-1 metrics ─────────────────────────────────────────────────────────
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

  // ── Long-term projection ───────────────────────────────────────────────────
  const rows = useMemo(() =>
    buildProjection(
      propertyPrice, downPaymentPct, interestRate, loanTermYears,
      monthlyRent, vacancyRate, monthlyExpenses,
      appreciationRate, rentGrowthRate, expenseGrowthRate, projectionYears,
    ),
    [propertyPrice, downPaymentPct, interestRate, loanTermYears,
      monthlyRent, vacancyRate, monthlyExpenses,
      appreciationRate, rentGrowthRate, expenseGrowthRate, projectionYears]
  )

  const downPayment = metrics.downPayment
  const finalRow = rows[rows.length - 1]

  // IRR: initial outflow = -downPayment, then annual cash flows, last year adds sale proceeds (equity)
  const irrFlows = [-downPayment, ...rows.map((r, i) => r.cashFlow + (i === rows.length - 1 ? r.equity : 0))]
  const irr = calcIRR(irrFlows)

  // cumulativeCashFlow starts at -downPayment, so add it back to get net operating cash flows only
  const totalCashFlow = (finalRow?.cumulativeCashFlow ?? 0) + downPayment
  const totalEquityGain = (finalRow?.equity ?? 0) - downPayment
  const totalReturn = totalCashFlow + totalEquityGain
  // CAGR of total wealth relative to the initial investment
  const cagr = downPayment > 0 && projectionYears > 0
    ? (Math.pow((downPayment + totalReturn) / downPayment, 1 / projectionYears) - 1) * 100
    : 0

  const equityChartData = rows.map((r) => ({
    year: `Yr ${r.year}`,
    equity: Math.round(r.equity),
    propertyValue: Math.round(r.propertyValue),
  }))

  const cashFlowChartData = rows.map((r) => ({
    year: r.year,
    cashFlow: Math.round(r.cashFlow),
  }))

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
              <p className="text-sm text-background/60">Year-1 ratios plus a {projectionYears}-year hold projection</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6 shrink-0">
            {[
              { label: "Cap Rate",   value: fmtPct(metrics.capRate),       highlight: metrics.capRate >= 8,   tip: "Net Operating Income ÷ Purchase Price. Target ≥ 8%." },
              { label: "CoC Return", value: fmtPct(metrics.coc),           highlight: metrics.coc >= 10,      tip: "Cash-on-Cash: annual cash flow ÷ down payment. Target ≥ 10%." },
              { label: "DSCR",       value: `${metrics.dscr.toFixed(2)}x`, highlight: metrics.dscr >= 1.25,   tip: "NOI ÷ annual mortgage payments. Target ≥ 1.25x." },
              { label: "IRR",        value: irr !== null ? fmtPct(irr) : "N/A", highlight: (irr ?? 0) >= 10,  tip: "Internal Rate of Return over the full holding period, including the final sale." },
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
        {/* ── Left: Inputs (one shared deal) ── */}
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
                <span>Down: {fmt(downPayment)}</span>
                <span>Loan: {fmt(metrics.loanAmount)}</span>
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

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Growth Assumptions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <NumberInput label="Annual Appreciation" value={appreciationRate} onChange={setAppreciationRate} suffix="%" step={0.25} />
                <p className="text-xs text-muted-foreground mt-1 px-1">AI-derived: {fmtPct(defaultAppreciation)}</p>
              </div>
              <NumberInput label="Annual Rent Growth"    value={rentGrowthRate}    onChange={setRentGrowthRate}    suffix="%" step={0.25} />
              <NumberInput label="Annual Expense Growth" value={expenseGrowthRate} onChange={setExpenseGrowthRate} suffix="%" step={0.25} />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Projection Period</label>
                <select
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
                >
                  <option value={5}>5 years</option>
                  <option value={10}>10 years</option>
                  <option value={15}>15 years</option>
                  <option value={20}>20 years</option>
                  <option value={30}>30 years</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Year-1 analysis, then long-term projection ── */}
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
                <MetricCard label="Monthly Payment"   value={fmt(metrics.monthlyMortgage)}     sub="P&I only" />
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
                  { label: "Gross Yield",           value: fmtPct(metrics.grossYield),      sub: "Annual rent / price" },
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
                <CardTitle className="text-base font-semibold">Annual P&amp;L Summary <span className="font-normal text-muted-foreground">— Year 1</span></CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[
                  { label: "Gross Rental Income",           value: fmt(monthlyRent * 12),                          sign: "+", accent: "text-emerald-600" },
                  { label: `Vacancy Loss (${vacancyRate}%)`, value: fmt(monthlyRent * 12 * vacancyRate / 100),      sign: "−", accent: "text-red-500" },
                  { label: "Effective Gross Income",         value: fmt(metrics.effectiveGrossIncome),              sign: "",  accent: "text-foreground", bold: true },
                  { label: "Operating Expenses",             value: fmt(metrics.annualExpenses),                    sign: "−", accent: "text-red-500" },
                  { label: "Net Operating Income",           value: fmt(metrics.noi),                               sign: "",  accent: "text-foreground", bold: true },
                  { label: "Annual Debt Service",            value: fmt(metrics.annualDebtService),                 sign: "−", accent: "text-red-500" },
                  { label: "Annual Cash Flow",               value: fmt(metrics.annualCashFlow),                    sign: "",  accent: metrics.annualCashFlow >= 0 ? "text-emerald-600" : "text-red-500", bold: true },
                ].map(({ label, value, sign, accent, bold }) => (
                  <div key={label} className={`flex items-center justify-between py-2 ${bold ? "border-t border-dashed border-border mt-1 pt-3" : ""}`}>
                    <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                    <span className={`text-sm font-semibold ${accent}`}>{sign} {value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Long-term hold ─────────────────────────────────────────────── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">{projectionYears}-Year Hold Projection</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Total Return" value={fmt(totalReturn)} sub="Equity gain + cash flow"
                  accent={totalReturn >= 0 ? "#10B981" : "#EF4444"}
                  tip="Everything you walk away with above your down payment: equity growth plus accumulated cash flow." />
                <MetricCard label="CAGR" value={fmtPct(cagr)} sub="Annualised growth"
                  tip="Compound annual growth rate of your invested capital over the holding period." />
                <MetricCard label="Equity at Exit" value={fmt(finalRow?.equity ?? 0)} sub="Value minus loan balance" />
                <MetricCard label="Total Cash Flow" value={fmt(totalCashFlow)} sub="Net of debt service"
                  accent={totalCashFlow >= 0 ? "#10B981" : "#EF4444"} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-1">
                Equity Build-up
                <InfoTip text="How your ownership stake grows as the loan pays down and the property appreciates." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={equityChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="propertyValue" name="Property Value" stroke="#10B981" fill="url(#valueGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="equity"        name="Equity"         stroke="#3B82F6" fill="url(#equityGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Annual Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={cashFlowChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tickFormatter={(v) => `Yr ${v}`} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                  <Bar dataKey="cashFlow" name="Annual Cash Flow" radius={[4, 4, 0, 0]}>
                    {cashFlowChartData.map((entry) => (
                      <Cell key={entry.year} fill={entry.cashFlow >= 0 ? "#10B981" : "#EF4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Year-by-Year Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Year", "Prop. Value", "Equity", "NOI", "Cash Flow", "Cumulative CF"].map((h) => (
                        <th key={h} className="text-left text-xs uppercase tracking-wide text-muted-foreground pb-3 pr-4 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.year} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-foreground">Yr {r.year}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{fmtK(r.propertyValue)}</td>
                        <td className="py-2.5 pr-4 text-foreground font-medium">{fmtK(r.equity)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{fmtK(r.noi)}</td>
                        <td className={`py-2.5 pr-4 font-medium ${r.cashFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {r.cashFlow >= 0 ? "+" : ""}{fmtK(r.cashFlow)}
                        </td>
                        <td className={`py-2.5 font-medium ${r.cumulativeCashFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {r.cumulativeCashFlow >= 0 ? "+" : ""}{fmtK(r.cumulativeCashFlow)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-muted/40 px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Purchase price pre-filled from your AI valuation; appreciation from your dataset's historical
              YoY average ({fmtPct(defaultAppreciation)}). Cumulative CF includes the initial down payment.
              IRR assumes sale at end of projection period. All figures are pre-tax estimates.
              DSCR ≥ 1.25 is typically required for investment property loans.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
