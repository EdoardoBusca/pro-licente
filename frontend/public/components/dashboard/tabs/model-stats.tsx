"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Trophy, Database, GitBranch, Layers, TrendingUp, CheckCircle2 } from "lucide-react"

const winningModel = {
  name: "XGBoost Regressor",
  metrics: {
    mape: 4.2,
    mae: 28450,
    rmse: 42680,
    r2: 0.94,
  },
}

const stats = [
  { label: "Sample Size", value: "12,847", subtext: "properties", icon: Database },
  { label: "Train / Test", value: "80 / 20", subtext: "split ratio", icon: GitBranch },
  { label: "Features", value: "47", subtext: "engineered", icon: Layers },
]

const leaderboard = [
  { rank: 1, model: "XGBoost Regressor", mape: 4.2, mae: 28450, rmse: 42680, r2: 0.94 },
  { rank: 2, model: "LightGBM", mape: 4.5, mae: 30120, rmse: 44920, r2: 0.93 },
  { rank: 3, model: "Random Forest", mape: 5.1, mae: 34200, rmse: 48150, r2: 0.91 },
  { rank: 4, model: "Gradient Boosting", mape: 5.4, mae: 36100, rmse: 51200, r2: 0.90 },
  { rank: 5, model: "Ridge Regression", mape: 7.2, mae: 48300, rmse: 62400, r2: 0.85 },
]

export function ModelStatsTab() {
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
              <h2 className="text-2xl font-semibold mb-4">{winningModel.name}</h2>
              <div className="flex items-center gap-2 text-sm text-estate-green">
                <CheckCircle2 className="w-4 h-4" />
                <span>Production Ready</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <MetricBadge label="MAPE" value={`${winningModel.metrics.mape}%`} highlight />
            <MetricBadge label="MAE" value={`$${(winningModel.metrics.mae / 1000).toFixed(1)}K`} />
            <MetricBadge label="RMSE" value={`$${(winningModel.metrics.rmse / 1000).toFixed(1)}K`} />
            <MetricBadge label="R²" value={winningModel.metrics.r2.toString()} />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.subtext}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leaderboard */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Model Leaderboard</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Performance comparison across all trained models</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm">
              <TrendingUp className="w-4 h-4 text-estate-green" />
              <span>5 models evaluated</span>
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
                <TableRow 
                  key={row.rank}
                  className={`border-0 ${row.rank === 1 ? 'bg-estate-green/5' : index % 2 === 0 ? 'bg-muted/30' : ''}`}
                >
                  <TableCell>
                    {row.rank === 1 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-estate-green text-background text-xs font-bold">
                        1
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                        {row.rank}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`font-medium ${row.rank === 1 ? 'text-estate-green' : ''}`}>{row.model}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.mape}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">${row.mae.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">${row.rmse.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.r2}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricBadge({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-background/50 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-estate-green' : ''}`}>{value}</p>
    </div>
  )
}
