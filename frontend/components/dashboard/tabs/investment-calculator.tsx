"use client"

import { useMemo, useState } from "react"
import {
  DollarSign, Percent, Home, TrendingUp, ShieldCheck,
  AlertTriangle, CheckCircle2, Info, Calculator,
} from "lucide-react"
import { InfoTip } from "@/components/ui/info-tip"
import type { TrainingResult } from "@/src/types"
import { calcMortgage, getDefaultPrice } from "@/src/finance"

interface InvestmentCalculatorTabProps {
  result: TrainingResult
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number, decimals = 2) => `${n.toFixed(decimals)}%`

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
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-gray-200 bg-[#F8FAFC] overflow-hidden focus-within:border-[#3B82F6] focus-within:ring-1 focus-within:ring-[#3B82F6] transition-all">
        {prefix && (
          <span className="px-3 text-sm text-[#64748B] border-r border-gray-200 bg-white select-none">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#0F172A] outline-none min-w-0"
        />
        {suffix && (
          <span className="px-3 text-sm text-[#64748B] border-l border-gray-200 bg-white select-none">{suffix}</span>
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

function MetricCard({ label, value, sub, accent = "#0F172A", bg = "#F8FAFC", tip }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 p-5" style={{ background: bg }}>
      <p className="text-xs uppercase tracking-wide text-[#64748B] flex items-center">
        {label}
        {tip && <InfoTip text={tip} side="bottom" />}
      </p>
      <p className="text-2xl font-bold mt-1.5" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-[#94A3B8] mt-1">{sub}</p>}
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
    <div className="space-y-8">
      {/* Deal Rating Banner */}
      <section
        className="rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={{ background: rating.bg, borderColor: rating.color + "33" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: rating.color + "22" }}>
            <RatingIcon className="w-5 h-5" style={{ color: rating.color }} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: rating.color + "99" }}>
              Deal Assessment
            </p>
            <p className="text-xl font-bold" style={{ color: rating.color }}>{rating.label}</p>
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide flex items-center" style={{ color: rating.color + "88" }}>Cap Rate<InfoTip text="Net Operating Income ÷ Purchase Price. Measures property yield independent of financing. Target ≥ 8% for investment properties." /></p>
            <p className="font-bold text-lg" style={{ color: rating.color }}>{fmtPct(metrics.capRate)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide flex items-center" style={{ color: rating.color + "88" }}>CoC Return<InfoTip text="Cash-on-Cash: annual cash flow ÷ down payment. Return on your actual cash invested. Target ≥ 10%." /></p>
            <p className="font-bold text-lg" style={{ color: rating.color }}>{fmtPct(metrics.coc)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide flex items-center" style={{ color: rating.color + "88" }}>DSCR<InfoTip text="Debt Service Coverage Ratio: NOI ÷ annual mortgage payments. Most lenders require ≥ 1.25 for investment loans. Below 1.0 means rent doesn't cover the mortgage." /></p>
            <p className="font-bold text-lg" style={{ color: rating.color }}>{metrics.dscr.toFixed(2)}x</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-8">
        {/* ── Left: Inputs ── */}
        <section className="space-y-6">
          {/* Property */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <Home className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Property</h3>
            </div>
            <div className="space-y-4">
              <NumberInput label="Purchase Price" value={propertyPrice} onChange={setPropertyPrice} prefix="$" step={1000} />
              <NumberInput label="Down Payment" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" step={0.5} min={0} max={100} />
              <div className="flex justify-between text-xs text-[#64748B] -mt-2 px-1">
                <span>Down: {fmt(propertyPrice * downPaymentPct / 100)}</span>
                <span>Loan: {fmt(propertyPrice * (1 - downPaymentPct / 100))}</span>
              </div>
            </div>
          </div>

          {/* Financing */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <Percent className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Financing</h3>
            </div>
            <div className="space-y-4">
              <NumberInput label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.125} min={0} />
              <NumberInput label="Loan Term" value={loanTermYears} onChange={setLoanTermYears} suffix="years" step={5} min={5} max={30} />
            </div>
          </div>

          {/* Income & Expenses */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Income & Expenses</h3>
            </div>
            <div className="space-y-4">
              <NumberInput label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" step={50} />
              <NumberInput label="Vacancy Rate" value={vacancyRate} onChange={setVacancyRate} suffix="%" step={0.5} min={0} max={50} />
              <NumberInput label="Monthly Operating Expenses" value={monthlyExpenses} onChange={setMonthlyExpenses} prefix="$" step={50} />
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Include property tax, insurance, maintenance, property management, HOA, etc.
              </p>
            </div>
          </div>
        </section>

        {/* ── Right: Metrics ── */}
        <div className="space-y-6">
          {/* Mortgage Breakdown */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <Calculator className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Mortgage Breakdown</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard label="Monthly Payment" value={fmt(metrics.monthlyMortgage)} sub="P&I only" accent="#3B82F6" bg="#EFF6FF" />
              <MetricCard label="Monthly Cash Flow" value={fmt(metrics.annualCashFlow / 12)} sub="After all costs" accent={metrics.annualCashFlow >= 0 ? "#166534" : "#991B1B"} bg={metrics.annualCashFlow >= 0 ? "#f0fdf4" : "#fef2f2"} />
              <MetricCard label="Annual NOI" value={fmt(metrics.noi)} sub="Before debt service" accent="#0F172A" tip="Net Operating Income: effective gross income minus operating expenses, before mortgage payments." />
              <MetricCard label="Break-even Rent" value={fmt(metrics.breakEvenRent)} sub="Required gross rent (vacancy-adjusted)" accent="#78350F" bg="#fef9ee" tip="Minimum monthly rent to cover all costs at your vacancy rate. Your actual rent must exceed this to generate positive cash flow." />
            </div>
          </section>

          {/* Investment Ratios */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Investment Ratios</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-[#64748B]">Cap Rate</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metrics.capRate >= 8 ? "bg-green-100 text-green-700" : metrics.capRate >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {metrics.capRate >= 8 ? "Strong" : metrics.capRate >= 5 ? "Fair" : "Weak"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtPct(metrics.capRate)}</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${Math.min(100, metrics.capRate * 7)}%` }} />
                </div>
                <p className="text-xs text-[#94A3B8] mt-1.5">Target: ≥ 8%</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-[#64748B]">Cash-on-Cash</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metrics.coc >= 10 ? "bg-green-100 text-green-700" : metrics.coc >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {metrics.coc >= 10 ? "Strong" : metrics.coc >= 6 ? "Fair" : "Weak"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtPct(metrics.coc)}</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${Math.min(100, metrics.coc * 5)}%` }} />
                </div>
                <p className="text-xs text-[#94A3B8] mt-1.5">Target: ≥ 10%</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-[#64748B]">DSCR</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${metrics.dscr >= 1.25 ? "bg-green-100 text-green-700" : metrics.dscr >= 1.0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {metrics.dscr >= 1.25 ? "Safe" : metrics.dscr >= 1.0 ? "Break-even" : "Risk"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#0F172A]">{metrics.dscr < 0 ? "Negative" : `${metrics.dscr.toFixed(2)}x`}</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${Math.min(100, metrics.dscr * 50)}%` }} />
                </div>
                <p className="text-xs text-[#94A3B8] mt-1.5">Target: ≥ 1.25x</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B] mb-2 flex items-center">Gross Rent Multiplier<InfoTip text="Purchase Price ÷ Annual Gross Rent. Quick cross-market comparison tool. Target &lt; 12x — lower means better rent-to-price ratio." side="bottom" /></p>
                <p className="text-2xl font-bold text-[#0F172A]">{metrics.grm.toFixed(1)}x</p>
                <p className="text-xs text-[#94A3B8] mt-1.5">Lower is better (target: &lt; 12x)</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B] mb-2">Gross Yield</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtPct(metrics.grossYield)}</p>
                <p className="text-xs text-[#94A3B8] mt-1.5">Annual rent / price</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B] mb-2">LTV Ratio</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtPct(100 - downPaymentPct, 0)}</p>
                <p className="text-xs text-[#94A3B8] mt-1.5">{downPaymentPct >= 20 ? "No PMI required" : "PMI likely required"}</p>
              </div>
            </div>
          </section>

          {/* Annual P&L Summary */}
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck className="w-4 h-4 text-[#334155]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Annual P&amp;L Summary</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: "Gross Rental Income",       value: fmt(monthlyRent * 12),                color: "#166534", sign: "+" },
                { label: `Vacancy Loss (${vacancyRate}%)`,  value: fmt(-monthlyRent * 12 * vacancyRate / 100), color: "#991B1B", sign: "−" },
                { label: "Effective Gross Income",    value: fmt(metrics.effectiveGrossIncome),     color: "#0F172A", sign: "" },
                { label: "Operating Expenses",        value: fmt(-metrics.annualExpenses),           color: "#991B1B", sign: "−" },
                { label: "Net Operating Income (NOI)",value: fmt(metrics.noi),                      color: "#1D4ED8", sign: "" },
                { label: "Annual Debt Service",       value: fmt(-metrics.annualDebtService),        color: "#991B1B", sign: "−" },
                { label: "Annual Cash Flow",          value: fmt(metrics.annualCashFlow),            color: metrics.annualCashFlow >= 0 ? "#166534" : "#991B1B", sign: "" },
              ].map(({ label, value, color, sign }, i) => (
                <div
                  key={label}
                  className={`flex items-center justify-between py-2 ${i === 2 || i === 4 || i === 6 ? "border-t border-dashed border-gray-200 pt-3 mt-1" : ""}`}
                >
                  <span className={`text-sm ${i === 2 || i === 4 || i === 6 ? "font-semibold text-[#0F172A]" : "text-[#334155]"}`}>{label}</span>
                  <span className="text-sm font-semibold" style={{ color }}>{sign} {value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Info note */}
          <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-[#64748B] mt-0.5 shrink-0" />
            <p className="text-sm text-[#64748B] leading-relaxed">
              Purchase price pre-filled from your AI valuation. Adjust all inputs to model your specific deal.
              DSCR ≥ 1.25 is typically required for investment property loans.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
