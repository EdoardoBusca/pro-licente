"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts"
import { ArrowUpRight, ArrowDownRight, DollarSign } from "lucide-react"

const waterfallData = [
  { name: "Baseline", value: 320000, fill: "var(--foreground)" },
  { name: "Sq Footage", value: 45000, fill: "var(--estate-green)" },
  { name: "Bedrooms", value: 18000, fill: "var(--estate-green)" },
  { name: "School Rating", value: 32000, fill: "var(--estate-green)" },
  { name: "Age", value: -15000, fill: "var(--estate-red)" },
  { name: "Lot Size", value: 22000, fill: "var(--estate-green)" },
  { name: "Final Price", value: 422000, fill: "var(--foreground)" },
]

const radarData = [
  { model: "XGBoost", value: 94 },
  { model: "LightGBM", value: 91 },
  { model: "RF", value: 87 },
  { model: "GBM", value: 85 },
  { model: "Ridge", value: 78 },
]

const featureLeverage = [
  { name: "Square Footage", value: 28 },
  { name: "School District Rating", value: 22 },
  { name: "Year Built", value: 15 },
  { name: "Lot Size", value: 12 },
  { name: "Number of Bathrooms", value: 10 },
  { name: "Garage Capacity", value: 8 },
  { name: "Pool", value: 5 },
]

export function ValuationEngineTab() {
  const totalPositive = waterfallData.filter(d => d.fill === "var(--estate-green)").reduce((acc, d) => acc + d.value, 0)
  const totalNegative = Math.abs(waterfallData.filter(d => d.fill === "var(--estate-red)").reduce((acc, d) => acc + d.value, 0))

  return (
    <div className="space-y-6">
      {/* Price Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Base Value</p>
                <p className="text-xl font-semibold">$320,000</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-estate-green/5 border-estate-green/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-estate-green/20 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-estate-green" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Positive Impact</p>
                <p className="text-xl font-semibold text-estate-green">+${(totalPositive / 1000).toFixed(0)}K</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-estate-red/5 border-estate-red/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-estate-red/20 flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5 text-estate-red" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Negative Impact</p>
                <p className="text-xl font-semibold text-estate-red">-${(totalNegative / 1000).toFixed(0)}K</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waterfall Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Price Discovery Waterfall</CardTitle>
          <p className="text-sm text-muted-foreground">
            Breakdown of price components from baseline to final predicted value
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={waterfallData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
              >
                <XAxis 
                  type="number" 
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fill: 'var(--foreground)', fontSize: 12, fontWeight: 500 }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                  {waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Model Consensus</CardTitle>
            <p className="text-sm text-muted-foreground">
              Accuracy comparison across all trained models
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <PolarAngleAxis 
                    dataKey="model" 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <PolarRadiusAxis 
                    angle={90} 
                    domain={[0, 100]} 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    tickCount={5}
                  />
                  <Radar
                    name="Accuracy"
                    dataKey="value"
                    stroke="var(--foreground)"
                    fill="var(--foreground)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Feature Leverage */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Feature Leverage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Top predictive features by importance score
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {featureLeverage.map((feature, index) => (
                <div key={feature.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{feature.name}</span>
                    <span className="text-sm font-semibold">{feature.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ 
                        width: `${feature.value}%`,
                        backgroundColor: index === 0 ? 'var(--foreground)' : index < 3 ? 'var(--muted-foreground)' : 'var(--border)'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
