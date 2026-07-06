/**
 * Shared display-formatting helpers.
 * Single source of truth — previously copy-pasted into every dashboard tab.
 */

/** Full USD currency, no decimals: 1234567 → "$1,234,567" */
export const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

/** Compact USD: 1_250_000 → "$1.3M", 480_000 → "$480K" */
export const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

/** Percentage: 6.444 → "6.44%" (decimals configurable) */
export const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`

/** Coerce unknown to a finite number, falling back when NaN/Infinity. */
export const safeNum = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
