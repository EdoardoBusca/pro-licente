/**
 * Shared real-estate finance utilities.
 * Single source of truth — imported by both cash-flow and investment-calculator tabs.
 */

import type { TrainingResult } from "./types"

/** Standard amortizing mortgage monthly payment. */
export function calcMortgage(principal: number, annualRate: number, termYears: number): number {
  if (annualRate === 0) return principal / (termYears * 12)
  const r = annualRate / 100 / 12
  const n = termYears * 12
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

/** Remaining loan balance after yearsPaid full years of payments. */
export function calcRemainingBalance(
  principal: number,
  annualRate: number,
  termYears: number,
  yearsPaid: number,
): number {
  if (yearsPaid >= termYears) return 0
  if (annualRate === 0) return principal * (1 - yearsPaid / termYears)
  const r = annualRate / 100 / 12
  const n = termYears * 12
  const p = Math.min(yearsPaid, termYears) * 12
  return (principal * (Math.pow(1 + r, n) - Math.pow(1 + r, p))) / (Math.pow(1 + r, n) - 1)
}

/**
 * IRR via bisection. Bounds [-20%, +50%] cover all realistic real-estate scenarios.
 * Returns rate as a percentage (e.g. 8.3), or null if no solution in range.
 */
export function calcIRR(cashFlows: number[]): number | null {
  const f = (rate: number) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0)
  let lo = -0.2,
    hi = 0.5
  if (f(lo) * f(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if ((hi - lo) / 2 < 1e-9) return mid * 100
    f(lo) * f(mid) <= 0 ? (hi = mid) : (lo = mid)
  }
  return ((lo + hi) / 2) * 100
}

/**
 * Best default price from the training result.
 * Priority: price_discovery final → projection last → first buy signal → fallback $450K
 */
export function getDefaultPrice(result: TrainingResult): number {
  const fromDiscovery = result.market_dynamics?.price_discovery?.find((d) => d.kind === "final")?.change
  if (fromDiscovery && fromDiscovery > 0) return Math.round(fromDiscovery)
  const fromProjection = result.projection?.[result.projection.length - 1]?.val
  if (fromProjection && fromProjection > 0) return Math.round(fromProjection)
  const fromArbitrage = result.arbitrage?.buy_signals?.[0]?.ai_value
  if (fromArbitrage && fromArbitrage > 0) return Math.round(fromArbitrage)
  return 450_000
}

/**
 * Average historical YoY appreciation from the result, clamped to [0, 15]%.
 * Falls back to 3.5% if no valid data.
 */
export function getDefaultAppreciation(result: TrainingResult): number {
  const metrics = result.market_dynamics?.temporal_analysis?.yoy_appreciation_metrics ?? []
  if (metrics.length === 0) return 3.5
  const validRates = metrics
    .map((m) => Number(m.yoy_appreciation))
    .filter((v) => Number.isFinite(v) && v > -20 && v < 40)
  if (validRates.length === 0) return 3.5
  const avg = validRates.reduce((a, b) => a + b, 0) / validRates.length
  return Math.max(0, Math.min(15, parseFloat(avg.toFixed(1))))
}
