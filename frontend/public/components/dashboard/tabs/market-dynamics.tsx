"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Clock, Zap, Target } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts"

const liquidityScore = 78
const expectedDays = 34

const roiOpportunities = [
  { feature: "Kitchen Upgrade x School Rating", lift: 12.4, icon: Zap },
  { feature: "Pool Addition x Lot Size", lift: 8.7, icon: Target },
  { feature: "Bathroom Remodel x Sq Footage", lift: 7.2, icon: TrendingUp },
  { feature: "Energy Efficiency x Year Built", lift: 5.9, icon: Zap },
]

const priceImpactData = [
  { range: "<$200K", count: 1240, highlight: false },
  { range: "$200-400K", count: 3850, highlight: true },
  { range: "$400-600K", count: 4120, highlight: true },
  { range: "$600-800K", count: 2340, highlight: false },
  { range: ">$800K", count: 1297, highlight: false },
]

export function MarketDynamicsTab() {
  const circumference = 2 * Math.PI * 70
  const strokeDashoffset = circumference - (liquidityScore / 100) * circumference

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liquidity Score Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Market Liquidity</CardTitle>
            <p className="text-sm text-muted-foreground">Current market activity score</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-4">
            <div className="relative w-44 h-44">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="88"
                  cy="88"
                  r="70"
                  stroke="var(--muted)"
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="88"
                  cy="88"
                  r="70"
                  stroke="var(--estate-green)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold">{liquidityScore}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Expected Time to Sale</p>
                <p className="text-lg font-semibold">{expectedDays} Days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ROI Opportunities */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">ROI Enhancement Opportunities</CardTitle>
            <p className="text-sm text-muted-foreground">
              Feature combinations with highest value impact
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {roiOpportunities.map((opportunity, index) => (
                <div 
                  key={index}
                  className="group relative overflow-hidden rounded-xl border border-border p-5 hover:border-estate-green/50 hover:bg-estate-green/5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-estate-green/10 flex items-center justify-center group-hover:bg-estate-green/20 transition-colors">
                      <opportunity.icon className="w-5 h-5 text-estate-green" />
                    </div>
                    <span className="text-2xl font-bold text-estate-green">
                      +{opportunity.lift}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Estimated Lift
                  </p>
                  <p className="text-sm font-medium leading-snug">
                    {opportunity.feature}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price Impact Distribution */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Price Impact Distribution</CardTitle>
              <p className="text-sm text-muted-foreground">
                Property count by price range in current market
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-foreground" />
                <span className="text-muted-foreground">High Volume</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-muted" />
                <span className="text-muted-foreground">Low Volume</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceImpactData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                <XAxis 
                  dataKey="range" 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={60}>
                  {priceImpactData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.highlight ? 'var(--foreground)' : 'var(--muted)'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
