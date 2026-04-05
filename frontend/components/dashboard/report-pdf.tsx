"use client"

import {
  Document, Page, Text, View, StyleSheet, pdf, Font,
} from "@react-pdf/renderer"
import type { TrainingResult } from "@/src/types"

// ─── Styles ────────────────────────────────────────────────────────────────────
const C = {
  navy:    "#0F172A",
  slate:   "#334155",
  muted:   "#64748B",
  light:   "#94A3B8",
  border:  "#E2E8F0",
  bg:      "#F8FAFC",
  green:   "#166534",
  greenBg: "#DCFCE7",
  red:     "#991B1B",
  redBg:   "#FEE2E2",
  blue:    "#1D4ED8",
  blueBg:  "#DBEAFE",
  amber:   "#92400E",
  amberBg: "#FEF3C7",
  white:   "#FFFFFF",
}

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 9, color: C.navy, backgroundColor: C.white, paddingHorizontal: 40, paddingVertical: 36 },
  // Cover
  coverBand:   { backgroundColor: C.navy, marginHorizontal: -40, marginTop: -36, paddingHorizontal: 40, paddingVertical: 32, marginBottom: 28 },
  coverTitle:  { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 4 },
  coverSub:    { fontSize: 11, color: "#94A3B8", marginBottom: 20 },
  coverMeta:   { fontSize: 9, color: "#64748B" },
  // Section headers
  sectionHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 8, marginTop: 18, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 4 },
  // KPI grid
  kpiRow:      { flexDirection: "row", gap: 8, marginBottom: 12 },
  kpiBox:      { flex: 1, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, padding: 10 },
  kpiLabel:    { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  kpiValue:    { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.navy },
  kpiSub:      { fontSize: 7, color: C.light, marginTop: 2 },
  // Tables
  table:       { width: "100%", marginBottom: 12 },
  thead:       { flexDirection: "row", backgroundColor: C.navy, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  th:          { fontFamily: "Helvetica-Bold", fontSize: 7, color: C.white, textTransform: "uppercase", letterSpacing: 0.4 },
  tr:          { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  trAlt:       { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg },
  td:          { fontSize: 8, color: C.slate },
  tdBold:      { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.navy },
  // Badges
  badge:       { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  // AI advice
  adviceBox:   { backgroundColor: "#F5F3FF", borderLeftWidth: 3, borderLeftColor: "#7C3AED", padding: 12, borderRadius: 4, marginBottom: 8 },
  adviceLine:  { fontSize: 8.5, color: C.slate, lineHeight: 1.6 },
  // Footer
  footer:      { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  footerText:  { fontSize: 7, color: C.light },
})

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number, d = 1) => `${n.toFixed(d)}%`
const fmtK   = (n: number) => Math.abs(n) >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${Math.round(n)}`

function calcMortgage(principal: number, rate: number, years: number) {
  if (rate === 0) return principal / (years * 12)
  const r = rate / 100 / 12, n = years * 12
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function calcRemainingBalance(principal: number, rate: number, years: number, paid: number) {
  if (paid >= years) return 0
  if (rate === 0) return principal * (1 - paid / years)
  const r = rate / 100 / 12, n = years * 12, p = paid * 12
  return principal * (Math.pow(1 + r, n) - Math.pow(1 + r, p)) / (Math.pow(1 + r, n) - 1)
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionHead}>{children}</Text>
}

function KpiBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.kpiBox}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, color ? { color } : {}]}>{value}</Text>
      {sub && <Text style={s.kpiSub}>{sub}</Text>}
    </View>
  )
}

// ─── PDF Document ──────────────────────────────────────────────────────────────
function ReportDocument({ result, aiAdvice, generatedAt }: {
  result: TrainingResult
  aiAdvice: string | null
  generatedAt: string
}) {
  const md      = result.market_dynamics
  const cycle   = md?.temporal_analysis?.market_cycle ?? "N/A"
  const yoyList = md?.temporal_analysis?.yoy_appreciation_metrics ?? []
  const yoy     = yoyList.length ? yoyList[yoyList.length - 1].yoy_appreciation : 0
  const liq     = Math.min(99, Math.max(1, Math.round(Number(md?.sales_velocity?.liquidity_score ?? 0))))
  const days    = md?.sales_velocity?.expected_days_to_sell
  const avgPrice = (result as any).avg_price ?? 0

  // Investment metrics (defaults based on avg price)
  const price    = avgPrice > 0 ? avgPrice : 450000
  const down     = price * 0.2
  const loan     = price - down
  const rate     = 7.0
  const termYrs  = 30
  const monthly  = calcMortgage(loan, rate, termYrs)
  const rent     = price * 0.007
  const vacancy  = 0.05
  const expenses = price * 0.001 * 12
  const egi      = rent * 12 * (1 - vacancy)
  const noi      = egi - expenses
  const ads      = monthly * 12
  const capRate  = (noi / price) * 100
  const coc      = ((noi - ads) / down) * 100
  const dscr     = noi / ads
  const grm      = price / (rent * 12)

  // 10-year cash flow table
  const appRate  = Math.max(0, Math.min(15, yoy))
  const cfRows   = Array.from({ length: 10 }, (_, i) => {
    const yr       = i + 1
    const propVal  = price * Math.pow(1 + appRate / 100, yr)
    const balance  = calcRemainingBalance(loan, rate, termYrs, yr)
    const equity   = propVal - balance
    const yRent    = rent * 12 * Math.pow(1.025, i)
    const effInc   = yRent * (1 - vacancy)
    const yExp     = expenses * Math.pow(1.03, i)
    const yrNoi    = effInc - yExp
    const cf       = yrNoi - ads
    return { yr, propVal, equity, yrNoi, cf }
  })

  const confidence = result.model_diagnostics?.confidence_level ?? "N/A"
  const confColor  = confidence === "High" ? C.green : confidence === "Medium" ? C.amber : C.red

  // Clean AI advice text (strip markdown)
  const cleanAdvice = (aiAdvice ?? "No AI advice generated.")
    .replace(/##\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .trim()

  return (
    <Document title="Estate Vantage — Analytics Report" author="Estate Vantage">
      {/* ── PAGE 1: Overview ───────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Cover band */}
        <View style={s.coverBand}>
          <Text style={s.coverTitle}>Estate Vantage</Text>
          <Text style={s.coverSub}>Real Estate Analytics Report</Text>
          <Text style={s.coverMeta}>Generated: {generatedAt}   •   Model: {result.winner}   •   Confidence: {confidence}</Text>
        </View>

        {/* Model Performance KPIs */}
        <SectionTitle>Model Performance</SectionTitle>
        <View style={s.kpiRow}>
          <KpiBox label="Winner Model"   value={result.winner}                    sub={`${result.train_size} train / ${result.test_size} test rows`} />
          <KpiBox label="R² Score"       value={result.r2_score.toFixed(3)}       sub="Variance explained" color={result.r2_score >= 0.8 ? C.green : C.amber} />
          <KpiBox label="MAPE"           value={fmtPct(result.mape)}              sub="Mean abs % error"   color={result.mape <= 10 ? C.green : result.mape <= 20 ? C.amber : C.red} />
          <KpiBox label="Confidence"     value={confidence}                       sub={`${Math.round(result.composite_confidence_score ?? 0)}% composite`} color={confColor} />
        </View>
        <View style={s.kpiRow}>
          <KpiBox label="MAE"  value={fmtK(result.mae)}  sub="Mean absolute error" />
          <KpiBox label="RMSE" value={fmtK(result.rmse)} sub="Root mean sq error"  />
          <KpiBox label="Split Ratio" value={result.split_ratio ?? "N/A"} sub="Train / Test" />
          <KpiBox label="AI Precision" value={result.ai_precision_label ?? "N/A"} />
        </View>

        {/* Model Leaderboard */}
        <SectionTitle>Model Leaderboard</SectionTitle>
        <View style={s.table}>
          <View style={s.thead}>
            {["Model", "R²", "MAPE", "MAE", "RMSE"].map((h, i) => (
              <Text key={h} style={[s.th, { flex: i === 0 ? 2 : 1 }]}>{h}</Text>
            ))}
          </View>
          {(result.leaderboard ?? []).map((row, i) => (
            <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
              <Text style={[s.tdBold, { flex: 2 }]}>{row.name}{row.name === result.winner ? " ★" : ""}</Text>
              <Text style={[s.td, { flex: 1 }]}>{row.r2.toFixed(3)}</Text>
              <Text style={[s.td, { flex: 1 }]}>{fmtPct(row.mape)}</Text>
              <Text style={[s.td, { flex: 1 }]}>{fmtK(row.mae)}</Text>
              <Text style={[s.td, { flex: 1 }]}>{fmtK(row.rmse)}</Text>
            </View>
          ))}
        </View>

        {/* Market Overview */}
        <SectionTitle>Market Overview</SectionTitle>
        <View style={s.kpiRow}>
          <KpiBox label="Market Cycle"       value={cycle.split(" - ")[0]}       sub={cycle.split(" - ")[1] ?? ""} />
          <KpiBox label="YoY Appreciation"   value={fmtPct(yoy)}                 sub="Latest annual rate" color={yoy > 3 ? C.green : yoy > 0 ? C.amber : C.red} />
          <KpiBox label="Liquidity Score"    value={`${liq}/99`}                 sub={days ? `~${days} days to sell` : "Score out of 99"} />
          <KpiBox label="Avg Market Price"   value={avgPrice > 0 ? fmtK(avgPrice) : "N/A"} sub="Dataset average" />
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Estate Vantage Analytics Report</Text>
          <Text style={s.footerText}>Page 1</Text>
        </View>
      </Page>

      {/* ── PAGE 2: Signals & Features ─────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Buy Signals */}
        <SectionTitle>Top Buy Opportunities (Undervalued Properties)</SectionTitle>
        {(result.arbitrage?.buy_signals?.length ?? 0) === 0 ? (
          <Text style={[s.td, { marginBottom: 12 }]}>No buy signals found in this dataset.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.thead}>
              {["Property #", "List Price", "AI Value", "Delta", "Potential Gain"].map((h, i) => (
                <Text key={h} style={[s.th, { flex: i === 3 ? 0.8 : 1 }]}>{h}</Text>
              ))}
            </View>
            {(result.arbitrage.buy_signals ?? []).slice(0, 8).map((sig, i) => (
              <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
                <Text style={[s.td,     { flex: 1 }]}>#{sig.property_idx + 1}</Text>
                <Text style={[s.td,     { flex: 1 }]}>{fmtK(sig.list_price)}</Text>
                <Text style={[s.tdBold, { flex: 1, color: C.green }]}>{fmtK(sig.ai_value)}</Text>
                <Text style={[s.tdBold, { flex: 0.8, color: C.green }]}>+{fmtPct(sig.delta_pct)}</Text>
                <Text style={[s.td,     { flex: 1 }]}>{sig.potential_gain ? fmtK(sig.potential_gain) : "—"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Risk Signals */}
        <SectionTitle>Top Risk Signals (Overpriced Properties)</SectionTitle>
        {(result.arbitrage?.risk_signals?.length ?? 0) === 0 ? (
          <Text style={[s.td, { marginBottom: 12 }]}>No risk signals found in this dataset.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.thead}>
              {["Property #", "List Price", "AI Value", "Delta", "Potential Loss"].map((h, i) => (
                <Text key={h} style={[s.th, { flex: i === 3 ? 0.8 : 1 }]}>{h}</Text>
              ))}
            </View>
            {(result.arbitrage.risk_signals ?? []).slice(0, 8).map((sig, i) => (
              <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
                <Text style={[s.td,     { flex: 1 }]}>#{sig.property_idx + 1}</Text>
                <Text style={[s.td,     { flex: 1 }]}>{fmtK(sig.list_price)}</Text>
                <Text style={[s.tdBold, { flex: 1, color: C.red }]}>{fmtK(sig.ai_value)}</Text>
                <Text style={[s.tdBold, { flex: 0.8, color: C.red }]}>{fmtPct(sig.delta_pct)}</Text>
                <Text style={[s.td,     { flex: 1 }]}>{sig.potential_loss ? fmtK(sig.potential_loss) : "—"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Feature Importance */}
        <SectionTitle>Top Predictive Features</SectionTitle>
        <View style={s.table}>
          <View style={s.thead}>
            {["Feature", "Importance Score", "Correlation"].map(h => (
              <Text key={h} style={[s.th, { flex: h === "Feature" ? 2 : 1 }]}>{h}</Text>
            ))}
          </View>
          {(result.feature_importance ?? []).slice(0, 10).map((f, i) => (
            <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
              <Text style={[s.tdBold, { flex: 2 }]}>{f.feature.replace(/_/g, " ")}</Text>
              <Text style={[s.td,     { flex: 1 }]}>{(f.importance * 100).toFixed(2)}%</Text>
              <Text style={[s.td,     { flex: 1 }]}>
                {result.correlation_lookup?.[f.feature] != null
                  ? result.correlation_lookup[f.feature].toFixed(3)
                  : "—"}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Estate Vantage Analytics Report</Text>
          <Text style={s.footerText}>Page 2</Text>
        </View>
      </Page>

      {/* ── PAGE 3: Investment & Cash Flow ─────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <SectionTitle>Investment Metrics (Based on Dataset Avg Price)</SectionTitle>
        <Text style={[s.kpiSub, { marginBottom: 10 }]}>
          Calculated on avg price {fmt(price)} · 20% down · 7% rate · 30yr · rent {fmt(rent)}/mo · 5% vacancy
        </Text>
        <View style={s.kpiRow}>
          <KpiBox label="Cap Rate"         value={fmtPct(capRate)}      color={capRate >= 8 ? C.green : capRate >= 5 ? C.amber : C.red}  sub="NOI / Property Price" />
          <KpiBox label="Cash-on-Cash"     value={fmtPct(coc)}          color={coc >= 10 ? C.green : coc >= 6 ? C.amber : C.red}         sub="Annual CF / Down Payment" />
          <KpiBox label="DSCR"             value={`${dscr.toFixed(2)}x`} color={dscr >= 1.25 ? C.green : dscr >= 1 ? C.amber : C.red}   sub="NOI / Debt Service" />
          <KpiBox label="GRM"              value={`${grm.toFixed(1)}x`}                                                                   sub="Price / Annual Rent" />
        </View>
        <View style={s.kpiRow}>
          <KpiBox label="Annual NOI"       value={fmt(noi)}   sub="Before debt service" />
          <KpiBox label="Annual Cash Flow" value={fmt(noi - ads)} color={noi - ads >= 0 ? C.green : C.red} sub="After all costs" />
          <KpiBox label="Monthly Payment"  value={fmt(monthly)} sub="P&I only" />
          <KpiBox label="Down Payment"     value={fmt(down)}    sub="20% of avg price" />
        </View>

        {/* 10-Year Cash Flow Table */}
        <SectionTitle>10-Year Cash Flow Projection</SectionTitle>
        <Text style={[s.kpiSub, { marginBottom: 8 }]}>
          Appreciation: {fmtPct(appRate)} (dataset YoY avg) · Rent growth 2.5%/yr · Expense growth 3%/yr
        </Text>
        <View style={s.table}>
          <View style={s.thead}>
            {["Year", "Property Value", "Equity", "NOI", "Cash Flow"].map(h => (
              <Text key={h} style={[s.th, { flex: 1 }]}>{h}</Text>
            ))}
          </View>
          {cfRows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
              <Text style={[s.tdBold, { flex: 1 }]}>Year {r.yr}</Text>
              <Text style={[s.td,     { flex: 1 }]}>{fmtK(r.propVal)}</Text>
              <Text style={[s.td,     { flex: 1, color: C.blue }]}>{fmtK(r.equity)}</Text>
              <Text style={[s.td,     { flex: 1 }]}>{fmtK(r.yrNoi)}</Text>
              <Text style={[s.td,     { flex: 1, color: r.cf >= 0 ? C.green : C.red }]}>
                {r.cf >= 0 ? "+" : ""}{fmtK(r.cf)}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Estate Vantage Analytics Report</Text>
          <Text style={s.footerText}>Page 3</Text>
        </View>
      </Page>

      {/* ── PAGE 4: AI Advice ──────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <SectionTitle>AI Investment Intelligence</SectionTitle>
        <Text style={[s.kpiSub, { marginBottom: 12 }]}>
          Generated by Groq AI based on your dataset's ML results and market signals.
        </Text>
        <View style={s.adviceBox}>
          <Text style={s.adviceLine}>{cleanAdvice}</Text>
        </View>

        {/* YoY Appreciation History */}
        {yoyList.length > 0 && (
          <>
            <SectionTitle>Year-over-Year Price Appreciation History</SectionTitle>
            <View style={s.table}>
              <View style={s.thead}>
                {["Year", "Avg Price", "YoY Appreciation", "Sample Count"].map(h => (
                  <Text key={h} style={[s.th, { flex: 1 }]}>{h}</Text>
                ))}
              </View>
              {yoyList.map((row, i) => (
                <View key={i} style={i % 2 === 0 ? s.tr : s.trAlt}>
                  <Text style={[s.tdBold, { flex: 1 }]}>{row.year}</Text>
                  <Text style={[s.td,     { flex: 1 }]}>{fmtK(row.price_avg)}</Text>
                  <Text style={[s.td,     { flex: 1, color: row.yoy_appreciation > 3 ? C.green : row.yoy_appreciation > 0 ? C.amber : C.red }]}>
                    {row.yoy_appreciation > 0 ? "+" : ""}{fmtPct(row.yoy_appreciation)}
                  </Text>
                  <Text style={[s.td,     { flex: 1 }]}>{row.sample_count}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Disclaimer */}
        <View style={{ marginTop: 24, padding: 10, backgroundColor: C.bg, borderRadius: 4 }}>
          <Text style={{ fontSize: 7, color: C.light, lineHeight: 1.5 }}>
            Disclaimer: This report is generated by an AI-assisted analytics platform and is intended for
            informational purposes only. It does not constitute financial, legal, or investment advice.
            All projections are estimates based on historical data and model assumptions. Actual results
            may vary. Consult a licensed real estate professional before making investment decisions.
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Estate Vantage Analytics Report — Confidential</Text>
          <Text style={s.footerText}>Page 4</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Export trigger ────────────────────────────────────────────────────────────
export async function downloadPDF(result: TrainingResult, aiAdvice: string | null) {
  const generatedAt = new Date().toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
  const blob = await pdf(
    <ReportDocument result={result} aiAdvice={aiAdvice} generatedAt={generatedAt} />
  ).toBlob()
  const url  = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href     = url
  link.download = `estate-vantage-report-${new Date().toISOString().slice(0, 10)}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
