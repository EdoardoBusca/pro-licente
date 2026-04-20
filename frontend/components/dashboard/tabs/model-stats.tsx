"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts"
import { Trophy, Database, GitBranch, Layers, TrendingUp, CheckCircle2 } from "lucide-react"
import type { TrainingResult } from "@/src/types"
import { InfoTip } from "@/components/ui/info-tip"

interface ModelStatsTabProps {
  result: TrainingResult
}

export function ModelStatsTab({ result }: ModelStatsTabProps) {
  const totalSamples  = result.train_size + result.test_size
  const leaderboard   = result.leaderboard

  // Forecast chart data
  const historicalData = (result.full_chart_data ?? []).filter((p) => p.is_historical)
  const projectedData  = (result.full_chart_data ?? []).filter((p) => !p.is_historical)
  const pivotDay       = projectedData[0]?.day

  // Residuals histogram
  const residualBuckets = buildResidualBuckets(result.residuals ?? [])

  return (
    <div className="space-y-6">
      {/* Winning Model Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-estate-green" />
            </div>
            <div>
              <p className="text-sm text-background/60 mb-1">Winning Model</p>
              <h2 className="text-2xl font-semibold mb-4">{result.winner}</h2>
              <div className="flex items-center gap-2 text-sm text-estate-green">
                <CheckCircle2 className="w-4 h-4" />
                <span>Production Ready</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <MetricBadge label="MAPE"  value={`${result.mape.toFixed(1)}%`} highlight tip="Mean Absolute Percentage Error — average % gap between predicted and actual sale prices. Lower is better. Under 10% is strong for real estate." />
            <MetricBadge label="MAE"   value={`$${(result.mae / 1000).toFixed(1)}K`} tip="Mean Absolute Error — average dollar difference between predictions and actual prices." />
            <MetricBadge label="RMSE"  value={`$${(result.rmse / 1000).toFixed(1)}K`} tip="Root Mean Squared Error — like MAE but penalises large errors more heavily. Useful for spotting outlier predictions." />
            <MetricBadge label="R²"    value={result.r2_score.toFixed(2)} tip="R-squared — how much of the price variation the model explains. 1.0 is perfect; above 0.75 is strong for real estate." />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Database}  value={totalSamples.toLocaleString()} subtext="properties" label="Sample Size" />
        <StatCard icon={GitBranch} value={result.split_ratio} subtext="train / test split" label="Split Ratio" />
        <StatCard icon={Layers}    value={result.model_diagnostics.confidence_level ?? "—"} subtext="model confidence level" label="AI Confidence" />
      </div>

      {/* Forecast Chart */}
      {result.full_chart_data && result.full_chart_data.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Price Forecast</CardTitle>
            <p className="text-sm text-muted-foreground">Historical actuals and model projection</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.replace("Day ", "D")}
                  interval="preserveStartEnd"
                  allowDuplicatedCategory={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  width={64}
                />
                <Tooltip
                  formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "Price"]}
                  labelFormatter={(l: string) => l}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend />
                <Line
                  data={historicalData}
                  dataKey="val"
                  name="Historical"
                  stroke="hsl(var(--foreground))"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  data={projectedData}
                  dataKey="val"
                  name="Forecast"
                  stroke="#10B981"
                  dot={false}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                />
                {pivotDay && (
                  <ReferenceLine
                    x={pivotDay}
                    stroke="#9CA3AF"
                    strokeDasharray="3 3"
                    label={{ value: "Forecast →", fontSize: 10, fill: "#9CA3AF", position: "insideTopRight" }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Residuals Histogram */}
      {result.residuals && result.residuals.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center">Prediction Error Spread<InfoTip text="Distribution of prediction errors (predicted minus actual). A tight bell curve centered at $0 means unbiased predictions with no systematic over- or under-valuation." /></CardTitle>
            <p className="text-sm text-muted-foreground">How errors are distributed — tighter and centered on $0 is better</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={residualBuckets} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, "Count"]} labelFormatter={(l: string) => `Error: ${l}`} />
                <ReferenceLine x="$0K" stroke="#10B981" strokeDasharray="4 2" />
                <Bar dataKey="count" fill="hsl(var(--foreground))" opacity={0.75} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* YoY Appreciation */}
      {(result.market_dynamics?.temporal_analysis?.yoy_appreciation_metrics ?? []).length > 1 && (() => {
        const yoy = result.market_dynamics.temporal_analysis.yoy_appreciation_metrics
        return (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold">Year-over-Year Appreciation</CardTitle>
              <p className="text-sm text-muted-foreground">
                Annual avg. price and % change · market cycle: <span className="font-medium">{result.market_dynamics.temporal_analysis.market_cycle}</span>
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yoy} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="price"
                    orientation="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                    width={64}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "Avg Price"
                        ? [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]
                        : [`${v.toFixed(2)}%`, name]
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar yAxisId="price" dataKey="price_avg" name="Avg Price" radius={[3, 3, 0, 0]}>
                    {yoy.map((entry) => (
                      <Cell key={entry.year} fill={entry.yoy_appreciation >= 0 ? "#10B981" : "#EF4444"} opacity={0.8} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="yoy_appreciation"
                    name="YoY %"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#F59E0B" }}
                  />
                  <ReferenceLine yAxisId="pct" y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )
      })()}

      {/* Leaderboard */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center">Model Leaderboard<InfoTip text="All models trained in parallel on your data and ranked by MAPE. The #1 model is automatically selected for all valuations." /></CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Performance comparison across all trained models</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm">
              <TrendingUp className="w-4 h-4 text-estate-green" />
              <span>{leaderboard.length} models evaluated</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-16 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rank</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</TableHead>
                <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">MAPE</TableHead>
                <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">MAE</TableHead>
                <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">RMSE</TableHead>
                <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">R²</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row, index) => (
                <TableRow key={index} className={`border-0 ${index === 0 ? "bg-estate-green/5" : index % 2 === 0 ? "bg-muted/30" : ""}`}>
                  <TableCell>
                    {index === 0 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-estate-green text-background text-xs font-bold">1</span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-muted-foreground text-xs font-medium">{index + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className={`font-medium ${index === 0 ? "text-estate-green" : ""}`}>{row.name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.mape.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">${row.mae.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                  <TableCell className="text-right font-mono text-sm">${row.rmse.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.r2.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function buildResidualBuckets(residuals: number[]): { label: string; count: number }[] {
  if (!residuals.length) return []
  const BINS = 18
  const min  = residuals.reduce((a, b) => (b < a ? b : a), residuals[0])
  const max  = residuals.reduce((a, b) => (b > a ? b : a), residuals[0])
  const step = (max - min) / BINS || 1
  return Array.from({ length: BINS }, (_, i) => {
    const lo = min + i * step
    const hi = lo + step
    return {
      label: `$${(lo / 1000).toFixed(0)}K`,
      count: residuals.filter((r) => r >= lo && (i === BINS - 1 ? r <= hi : r < hi)).length,
    }
  })
}

function MetricBadge({ label, value, highlight = false, tip }: { label: string; value: string; highlight?: boolean; tip?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-background/50 mb-1 flex items-center justify-center">
        {label}
        {tip && <InfoTip text={tip} />}
      </p>
      <p className={`text-xl font-semibold ${highlight ? "text-estate-green" : ""}`}>{value}</p>
    </div>
  )
}

function StatCard({ icon: Icon, value, subtext, label }: { icon: React.ElementType; value: string; subtext: string; label: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            <p className="text-sm text-muted-foreground">{subtext}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
