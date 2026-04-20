"use client"

import { useMemo, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Legend,
} from "recharts"
import { TrendingUp, DollarSign, Building2, Info, PiggyBank, Layers } from "lucide-react"
import { InfoTip } from "@/components/ui/info-tip"
import type { TrainingResult } from "@/src/types"
import { calcMortgage, calcRemainingBalance, calcIRR, getDefaultPrice, getDefaultAppreciation } from "@/src/finance"

interface CashFlowTabProps {
  result: TrainingResult
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
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
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">{label}</label>
      <div className="flex items-center rounded-lg border border-gray-200 bg-[#F8FAFC] overflow-hidden focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all">
        {prefix && <span className="px-3 text-sm text-[#64748B] border-r border-gray-200 bg-white select-none">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#0F172A] outline-none min-w-0"
        />
        {suffix && <span className="px-3 text-sm text-[#64748B] border-l border-gray-200 bg-white select-none">{suffix}</span>}
      </div>
    </div>
  )
}

const CashFlowTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 text-xs bg-white border border-gray-200 shadow-xl">
      <p className="font-semibold mb-2 text-[#0F172A]">Year {label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold text-[#0F172A]">{fmtK(p.value)}</span>
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
    <div className="space-y-8">
      {/* Summary KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: `${projectionYears}yr Total Return`,
            value: fmt(totalReturn),
            sub: fmtPct(totalReturnPct, 0) + " on invested capital",
            color: totalReturn >= 0 ? "#166534" : "#991B1B",
            bg: totalReturn >= 0 ? "#f0fdf4" : "#fef2f2",
            tip: "Total wealth created: equity built up plus all net cash flows, minus your initial down payment.",
          },
          {
            label: "IRR",
            value: irr !== null ? fmtPct(irr) : "N/A",
            sub: "Internal rate of return",
            color: (irr ?? 0) >= 10 ? "#166534" : (irr ?? 0) >= 6 ? "#92400E" : "#991B1B",
            bg: "#F8FAFC",
            tip: "Annualised return that accounts for the time value of all cash flows including the final sale. The standard benchmark for comparing investments.",
          },
          {
            label: "Equity at Exit",
            value: fmt(finalRow?.equity ?? 0),
            sub: `Property: ${fmt(finalRow?.propertyValue ?? 0)}`,
            color: "#1D4ED8",
            bg: "#EFF6FF",
            tip: "Projected property value minus remaining loan balance at the end of your holding period — what you'd pocket before taxes on a sale.",
          },
          {
            label: "Cumulative Cash Flow",
            value: fmt(totalCashFlow),
            sub: `${projectionYears} years of net income`,
            color: totalCashFlow >= 0 ? "#166534" : "#991B1B",
            bg: totalCashFlow >= 0 ? "#f0fdf4" : "#fef2f2",
            tip: "Total net operating income minus mortgage payments over the full holding period, before the sale.",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-100 p-5" style={{ background: kpi.bg }}>
            <p className="text-xs uppercase tracking-wide text-[#64748B] flex items-center">
              {kpi.label}
              <InfoTip text={kpi.tip} />
            </p>
            <p className="text-2xl font-bold mt-1.5" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{kpi.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-8">
        {/* ── Left: Inputs ── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Property & Financing</h3>
            </div>
            <div className="space-y-4">
              <NumberInput label="Purchase Price" value={propertyPrice} onChange={setPropertyPrice} prefix="$" step={1000} />
              <NumberInput label="Down Payment" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" step={0.5} min={0} />
              <NumberInput label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.125} />
              <NumberInput label="Loan Term" value={loanTermYears} onChange={setLoanTermYears} suffix="years" step={5} min={5} />
              <NumberInput label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" step={50} />
              <NumberInput label="Vacancy Rate" value={vacancyRate} onChange={setVacancyRate} suffix="%" step={0.5} />
              <NumberInput label="Monthly Expenses" value={monthlyExpenses} onChange={setMonthlyExpenses} prefix="$" step={50} />
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Growth Assumptions</h3>
            </div>
            <div className="space-y-4">
              <div>
                <NumberInput label="Annual Appreciation" value={appreciationRate} onChange={setAppreciationRate} suffix="%" step={0.25} />
                <p className="text-xs text-[#94A3B8] mt-1 px-1">AI-derived from your dataset: {fmtPct(defaultAppreciation)}</p>
              </div>
              <NumberInput label="Annual Rent Growth" value={rentGrowthRate} onChange={setRentGrowthRate} suffix="%" step={0.25} />
              <NumberInput label="Annual Expense Growth" value={expenseGrowthRate} onChange={setExpenseGrowthRate} suffix="%" step={0.25} />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Projection Period</label>
                <select
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none"
                >
                  <option value={5}>5 years</option>
                  <option value={10}>10 years</option>
                  <option value={15}>15 years</option>
                  <option value={20}>20 years</option>
                  <option value={30}>30 years</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* ── Right: Charts & Table ── */}
        <div className="space-y-6">
          {/* Equity Build Chart */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <Layers className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A] flex items-center">Equity Build-up<InfoTip text="How your ownership stake grows each year as the loan pays down (amortisation) and the property appreciates. The gap between property value and loan balance is your equity." /></h3>
            </div>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "#94A3B8" }} width={60} />
                <Tooltip content={<CashFlowTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="propertyValue" name="Property Value" stroke="#10B981" fill="url(#valueGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="equity" name="Equity" stroke="#3B82F6" fill="url(#equityGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          {/* Annual Cash Flow Chart */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Annual Cash Flow</h3>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cashFlowChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="year" tickFormatter={(v) => `Yr ${v}`} tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "#94A3B8" }} width={60} />
                <Tooltip content={<CashFlowTooltip />} />
                <ReferenceLine y={0} stroke="#E2E8F0" strokeWidth={1.5} />
                <Bar dataKey="cashFlow" name="Annual Cash Flow" radius={[4, 4, 0, 0]}>
                  {cashFlowChartData.map((entry) => (
                    <Cell key={entry.year} fill={entry.cashFlow >= 0 ? "#10B981" : "#EF4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* Year-by-Year Table */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <PiggyBank className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Year-by-Year Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Year", "Prop. Value", "Equity", "NOI", "Cash Flow", "Cumulative CF"].map((h) => (
                      <th key={h} className="text-left text-xs uppercase tracking-wide text-[#64748B] pb-3 pr-4 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year} className="border-b border-gray-50 hover:bg-[#FAFCFF] transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-[#0F172A]">Yr {r.year}</td>
                      <td className="py-2.5 pr-4 text-[#334155]">{fmtK(r.propertyValue)}</td>
                      <td className="py-2.5 pr-4 text-[#1D4ED8] font-medium">{fmtK(r.equity)}</td>
                      <td className="py-2.5 pr-4 text-[#334155]">{fmtK(r.noi)}</td>
                      <td className={`py-2.5 pr-4 font-medium ${r.cashFlow >= 0 ? "text-[#166534]" : "text-[#991B1B]"}`}>
                        {r.cashFlow >= 0 ? "+" : ""}{fmtK(r.cashFlow)}
                      </td>
                      <td className={`py-2.5 font-medium ${r.cumulativeCashFlow >= 0 ? "text-[#166534]" : "text-[#991B1B]"}`}>
                        {r.cumulativeCashFlow >= 0 ? "+" : ""}{fmtK(r.cumulativeCashFlow)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Info */}
          <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-[#64748B] mt-0.5 shrink-0" />
            <p className="text-sm text-[#64748B] leading-relaxed">
              Appreciation rate pre-filled from your dataset's historical YoY average ({fmtPct(defaultAppreciation)}).
              IRR assumes property sale at end of projection period. All figures are pre-tax estimates.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
