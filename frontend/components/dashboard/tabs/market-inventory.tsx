"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Building2, TrendingUp, AlertTriangle, Search, TrendingDown, BarChart2, CheckCircle2 } from "lucide-react"
import { InfoTip } from "@/components/ui/info-tip"
import { Input } from "@/components/ui/input"
import type { TrainingResult } from "@/src/types"

interface MarketInventoryTabProps {
  result: TrainingResult
}

export function MarketInventoryTab({ result }: MarketInventoryTabProps) {
  const [search, setSearch] = useState("")

  const dq = result.data_quality
  const arb = result.arbitrage

  const avgDeltaPct = arb.valuation_delta_stats?.mean_delta_pct
  const avgDeltaStr = avgDeltaPct != null
    ? `${avgDeltaPct >= 0 ? "+" : ""}${avgDeltaPct.toFixed(1)}%`
    : "N/A"

  const summaryCards = [
    { label: "Total Properties", value: dq.total_rows.toLocaleString(), icon: Building2, highlight: false },
    { label: "Avg AI vs Market", value: avgDeltaStr, icon: BarChart2, highlight: false },
    { label: "Undervalued Signals", value: String(arb.undervalued_count), icon: TrendingUp, highlight: true },
    { label: "Overpriced Signals", value: String(arb.overpriced_count), icon: TrendingDown, highlight: false },
  ]

  const allSignals = useMemo(() => [
    ...arb.buy_signals.map((s) => ({ ...s, signalType: "buy" as const })),
    ...arb.risk_signals.map((s) => ({ ...s, signalType: "risk" as const })),
  ], [arb.buy_signals, arb.risk_signals])

  const filtered = allSignals.filter(
    (s) =>
      search === "" ||
      String(s.property_idx).includes(search) ||
      s.alert.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">Market Inventory</p>
              <h2 className="text-3xl font-semibold tabular-nums mb-3">{dq.total_rows.toLocaleString()}</h2>
              <div className="flex items-center gap-2 text-sm text-estate-green">
                <CheckCircle2 className="w-4 h-4" />
                <span>Properties analyzed</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 shrink-0">
            {[
              { label: "Undervalued",  value: String(arb.undervalued_count), highlight: true,  tip: "Properties trading below AI estimated value." },
              { label: "Overpriced",   value: String(arb.overpriced_count),  highlight: false, tip: "Properties trading above AI estimated value." },
              { label: "Avg AI Delta", value: avgDeltaStr,                   highlight: false, tip: "Average % gap between AI valuation and list price." },
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`border-0 shadow-sm ${card.highlight ? "bg-estate-green/5" : ""}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.highlight ? "bg-estate-green/20" : "bg-muted"}`}>
                  <card.icon className={`w-5 h-5 ${card.highlight ? "text-estate-green" : "text-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-semibold ${card.highlight ? "text-estate-green" : ""}`}>{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dq.warnings.length > 0 && (
        <div className="flex items-start gap-4 p-5 rounded-xl bg-estate-amber/5 border border-estate-amber/20">
          <div className="w-10 h-10 rounded-lg bg-estate-amber/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-estate-amber" />
          </div>
          <div>
            <p className="font-medium text-sm mb-1">Data Quality Notice</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {dq.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center">Valuation Signals<InfoTip text="Properties where the gap between AI valuation and list price exceeds the model's typical error margin — flagged as actionable buy or risk signals." /></CardTitle>
              <p className="text-sm text-muted-foreground">
                Properties flagged as undervalued or overpriced by the AI engine
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search signals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/50">
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Signal</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Property #</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">List Price</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">AI Value</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">Delta %</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 30).map((row, index) => (
                  <TableRow key={`${row.signalType}-${row.property_idx}`} className={`border-0 ${index % 2 === 0 ? "" : "bg-muted/30"} hover:bg-muted/50 transition-colors`}>
                    <TableCell>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${row.signalType === "buy" ? "bg-estate-green/10 text-estate-green" : "bg-estate-red/10 text-estate-red"}`}>
                        {row.signalType === "buy" ? "Buy" : "Risk"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">#{row.property_idx}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${row.list_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${row.ai_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${row.delta_pct > 0 ? "text-estate-green" : "text-estate-red"}`}>
                      {row.delta_pct > 0 ? "+" : ""}{row.delta_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{row.alert}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No matching signals found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">Showing {Math.min(30, filtered.length)} of {filtered.length} signals</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
