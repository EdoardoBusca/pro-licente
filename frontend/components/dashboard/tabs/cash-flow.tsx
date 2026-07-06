"use client"

import { useMemo, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Legend,
} from "recharts"
import { TrendingUp, DollarSign, Building2, Info, PiggyBank, Layers, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTip } from "@/components/ui/info-tip"
import type { TrainingResult } from "@/src/types"
import { calcMortgage, calcRemainingBalance, calcIRR, getDefaultPrice, getDefaultAppreciation } from "@/src/finance"
import { fmt, fmtK, fmtPct } from "@/lib/format"

interface CashFlowTabProps {
  result: TrainingResult
}

interface ProjectionRow {
  year: number
  propertyValue: number
  loanBalance: number
  equity: number
  annualRent: number
  annualExpenses: number
  annualDebtService: number
  noi: number
  cashFlow: number
  cumulativeCashFlow: number
  totalReturn: number
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
    const totalReturn = equity - downPayment + (cumulativeCashFlow + downPayment)

    rows.push({
      year, propertyValue, loanBalance, equity,
      annualRent: effectiveIncome, annualExpenses: yearlyExpenses, annualDebtService,
      noi, cashFlow, cumulativeCashFlow, totalReturn,
    })
  }
  return rows
}

function NumberInput({
  label, value, onChange, prefix, suffix, step = 1, min = 0,
}: {
  label: string; value: number; onChange: (v: number) => void
  prefix?: string; suffix?: string; step?: number; min?: number
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</label>
      <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden focus-within:ring-1 focus-within:ring-foreground/20 transition-all">
        {prefix && <span className="px-3 text-sm text-muted-foreground border-r border-border bg-muted/40 select-none">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none min-w-0"
        />
        {suffix && <span className="px-3 text-sm text-muted-foreground border-l border-border bg-muted/40 select-none">{suffix}</span>}
      </div>
    </div>
  )
}

const CashFlowTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
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

export function CashFlowTab({ result }: CashFlowTabProps) {
  const defaultPrice = useMemo(() => getDefaultPrice(result), [result])
  const defaultAppreciation = useMemo(() => getDefaultAppreciation(result), [result])

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

  const downPayment = propertyPrice * (downPaymentPct / 100)
  const finalRow = rows[rows.length - 1]

  // IRR: initial outflow = -downPayment, then annual cash flows, last year add sale proceeds (equity)
  const irrFlows = [-downPayment, ...rows.map((r, i) => r.cashFlow + (i === rows.length - 1 ? r.equity : 0))]
  const irr = calcIRR(irrFlows)

  // cumulativeCashFlow starts at -downPayment, so add it back to get net operating cash flows only
  const totalCashFlow = (finalRow?.cumulativeCashFlow ?? 0) + downPayment
  const totalEquityGain = (finalRow?.equity ?? 0) - downPayment
  const totalReturn = totalCashFlow + totalEquityGain   // = equity + net cash flows - downPayment
  const totalReturnPct = downPayment > 0 ? (totalReturn / downPayment) * 100 : 0
  // CAGR: compound annual growth of total wealth relative to initial investment
  const annualizedReturn = downPayment > 0 && projectionYears > 0
    ? (Math.pow((downPayment + totalReturn) / downPayment, 1 / projectionYears) - 1) * 100
    : 0

  const equityChartData = rows.map((r) => ({
    year: `Yr ${r.year}`,
    equity: Math.round(r.equity),
    loanBalance: Math.round(r.loanBalance),
    propertyValue: Math.round(r.propertyValue),
  }))

  const cashFlowChartData = rows.map((r) => ({
    year: r.year,
    cashFlow: Math.round(r.cashFlow),
    cumulative: Math.round(r.cumulativeCashFlow),
  }))

  return (
    <div className="space-y-6">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <PiggyBank className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">Cash Flow &amp; Returns</p>
              <h2 className="text-3xl font-semibold tabular-nums mb-3">{fmt(totalReturn)}</h2>
              <div className="flex items-center gap-2 text-sm text-estate-green">
                <CheckCircle2 className="w-4 h-4" />
                <span>{projectionYears}-year projected total return</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 shrink-0">
            {[
              { label: "IRR",              value: irr !== null ? fmtPct(irr) : "N/A", highlight: (irr ?? 0) >= 10, tip: "Internal Rate of Return — annualised return including the final sale." },
              { label: "Equity at Exit",   value: fmt(finalRow?.equity ?? 0),          highlight: false,            tip: "Property value minus loan balance at end of holding period." },
              { label: "Total Cash Flow",  value: fmt(totalCashFlow),                  highlight: totalCashFlow >= 0, tip: "Net income minus debt service over the full holding period." },
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

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        {/* ── Left: Inputs ── */}
        <div className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Property &amp; Financing</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberInput label="Purchase Price"  value={propertyPrice}    onChange={setPropertyPrice}    prefix="$" step={1000} />
              <NumberInput label="Down Payment"    value={downPaymentPct}   onChange={setDownPaymentPct}   suffix="%" step={0.5} min={0} />
              <NumberInput label="Interest Rate"   value={interestRate}     onChange={setInterestRate}     suffix="%" step={0.125} />
              <NumberInput label="Loan Term"       value={loanTermYears}    onChange={setLoanTermYears}    suffix="years" step={5} min={5} />
              <NumberInput label="Monthly Rent"    value={monthlyRent}      onChange={setMonthlyRent}      prefix="$" step={50} />
              <NumberInput label="Vacancy Rate"    value={vacancyRate}      onChange={setVacancyRate}      suffix="%" step={0.5} />
              <NumberInput label="Monthly Expenses" value={monthlyExpenses}  onChange={setMonthlyExpenses}  prefix="$" step={50} />
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
              <NumberInput label="Annual Expense Growth" value={expenseGrowthRate}  onChange={setExpenseGrowthRate}  suffix="%" step={0.25} />
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

        {/* ── Right: Charts & Table ── */}
        <div className="space-y-6">
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
                  <Tooltip content={<CashFlowTooltip />} />
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
                  <Tooltip content={<CashFlowTooltip />} />
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
              Appreciation rate pre-filled from your dataset's historical YoY average ({fmtPct(defaultAppreciation)}).
              IRR assumes property sale at end of projection period. All figures are pre-tax estimates.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
