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
import { Building2, Columns, DollarSign, TrendingUp, AlertTriangle, Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const summaryCards = [
  { label: "Total Assets", value: "12,847", icon: Building2 },
  { label: "Feature Columns", value: "47", icon: Columns },
  { label: "Average Price", value: "$487,250", icon: DollarSign, highlight: true },
  { label: "Price Range", value: "$125K - $2.4M", icon: TrendingUp },
]

const inventoryData = [
  { address: "1234 Oak Street", zip: "90210", type: "Single Family", sqft: 2450, beds: 4, baths: 3, price: 525000 },
  { address: "567 Maple Avenue", zip: "90211", type: "Condo", sqft: 1200, beds: 2, baths: 2, price: 340000 },
  { address: "890 Pine Boulevard", zip: "90212", type: "Single Family", sqft: 3100, beds: 5, baths: 4, price: 780000 },
  { address: "234 Cedar Lane", zip: "90210", type: "Townhouse", sqft: 1850, beds: 3, baths: 2.5, price: 465000 },
  { address: "678 Birch Court", zip: "90213", type: "Single Family", sqft: 2800, beds: 4, baths: 3, price: 620000 },
  { address: "901 Elm Drive", zip: "90211", type: "Condo", sqft: 980, beds: 1, baths: 1, price: 285000 },
  { address: "345 Willow Way", zip: "90214", type: "Single Family", sqft: 4200, beds: 6, baths: 5, price: 1250000 },
  { address: "789 Aspen Road", zip: "90210", type: "Townhouse", sqft: 2100, beds: 3, baths: 3, price: 510000 },
  { address: "123 Spruce Street", zip: "90212", type: "Single Family", sqft: 1650, beds: 3, baths: 2, price: 395000 },
  { address: "456 Redwood Ave", zip: "90215", type: "Condo", sqft: 1450, beds: 2, baths: 2, price: 375000 },
]

export function MarketInventoryTab() {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`border-0 shadow-sm ${card.highlight ? 'bg-estate-green/5' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.highlight ? 'bg-estate-green/20' : 'bg-muted'}`}>
                  <card.icon className={`w-5 h-5 ${card.highlight ? 'text-estate-green' : 'text-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-semibold ${card.highlight ? 'text-estate-green' : ''}`}>{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Quality Notice */}
      <div className="flex items-start gap-4 p-5 rounded-xl bg-estate-amber/5 border border-estate-amber/20">
        <div className="w-10 h-10 rounded-lg bg-estate-amber/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-estate-amber" />
        </div>
        <div>
          <p className="font-medium text-sm mb-1">Data Quality Notice</p>
          <p className="text-sm text-muted-foreground">
            847 records (6.6%) have missing values in one or more fields. These records will be excluded from model training but included in inventory analysis.
          </p>
        </div>
      </div>

      {/* Property Inventory Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Property Inventory</CardTitle>
              <p className="text-sm text-muted-foreground">
                Sample of properties in the current dataset
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search properties..." 
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
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Address</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Zip</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">Sq Ft</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">Beds</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">Baths</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider">Est. Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryData.map((row, index) => (
                  <TableRow 
                    key={row.address}
                    className={`border-0 ${index % 2 === 0 ? '' : 'bg-muted/30'} hover:bg-muted/50 transition-colors`}
                  >
                    <TableCell className="font-medium">{row.address}</TableCell>
                    <TableCell className="text-muted-foreground">{row.zip}</TableCell>
                    <TableCell>
                      <span className={`
                        inline-flex px-2.5 py-1 rounded-full text-xs font-medium
                        ${row.type === 'Single Family' ? 'bg-foreground text-background' : ''}
                        ${row.type === 'Condo' ? 'bg-estate-green/10 text-estate-green' : ''}
                        ${row.type === 'Townhouse' ? 'bg-estate-amber/10 text-estate-amber' : ''}
                      `}>
                        {row.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.sqft.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.beds}</TableCell>
                    <TableCell className="text-right">{row.baths}</TableCell>
                    <TableCell className="text-right font-semibold">${row.price.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">Showing 10 of 12,847 properties</p>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-muted/80 transition-colors">Previous</button>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors">Next</button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
