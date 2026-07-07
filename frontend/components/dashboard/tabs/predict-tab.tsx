"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Home, CheckCircle2, Search, TableProperties, PenLine, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { predictSingle } from "@/src/api"
import type { TrainingResult, PropertyRow } from "@/src/types"
import { fmt } from "@/lib/format"

interface PredictTabProps {
  jobId: string
  result: TrainingResult
}

export function PredictTab({ jobId, result }: PredictTabProps) {
  const [mode, setMode]         = useState<"dataset" | "manual">("dataset")
  const [search, setSearch]     = useState("")
  const [selected, setSelected] = useState<PropertyRow | null>(null)

  const [sqFt,         setSqFt]         = useState("")
  const [bedrooms,     setBedrooms]     = useState("")
  const [bathrooms,    setBathrooms]    = useState("")
  const [condScore,    setCondScore]    = useState("")
  const [zipCode,      setZipCode]      = useState("")
  const [propertyType, setPropertyType] = useState("")

  const [prediction, setPrediction] = useState<number | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const resetResult = () => { setPrediction(null); setError(null) }

  const [availableZips, availablePropTypes] = useMemo(() => {
    const keys = Object.keys(result.correlation_lookup)
    return [
      keys.filter((k) => k.startsWith("Zip_Code_")).map((k) => k.replace("Zip_Code_", "")),
      keys.filter((k) => k.startsWith("Property_Type_")).map((k) => k.replace("Property_Type_", "")),
    ]
  }, [result.correlation_lookup])

  const properties = result.properties ?? []

  const filtered = useMemo(() => {
    if (!search) return properties.slice(0, 100)
    const q = search.toLowerCase()
    return properties.filter((p) =>
      String(p.property_idx).includes(q) ||
      (p.zip_code ?? "").toLowerCase().includes(q) ||
      (p.property_type ?? "").toLowerCase().includes(q)
    ).slice(0, 100)
  }, [properties, search])

  const selectProperty = (p: PropertyRow) => {
    setSelected(p)
    setSqFt(p.sq_ft_total != null ? String(p.sq_ft_total) : "")
    setBedrooms(p.bedrooms != null ? String(p.bedrooms) : "")
    setBathrooms(p.bathrooms != null ? String(p.bathrooms) : "")
    setCondScore(p.condition_score != null ? String(p.condition_score) : "")
    setZipCode(p.zip_code ?? "")
    setPropertyType(p.property_type ?? "")
    resetResult()
  }

  const handlePredict = async () => {
    if (!sqFt) return
    setLoading(true); setError(null); setPrediction(null)
    try {
      const res = await predictSingle(jobId, {
        sq_ft_total:     parseFloat(sqFt),
        bedrooms:        bedrooms     ? parseFloat(bedrooms)  : undefined,
        bathrooms:       bathrooms    ? parseFloat(bathrooms) : undefined,
        condition_score: condScore    ? parseFloat(condScore) : undefined,
        zip_code:        zipCode      || undefined,
        property_type:   propertyType || undefined,
      })
      setPrediction(res.predicted_price)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Prediction failed")
    } finally {
      setLoading(false)
    }
  }

  // Compare against the training-time AI value for this row (both are model
  // outputs, so the gap only reflects features the form doesn't capture).
  const delta = prediction != null && selected && selected.ai_value
    ? ((prediction - selected.ai_value) / selected.ai_value) * 100
    : null

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-foreground text-background p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-estate-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-estate-green/20 flex items-center justify-center shrink-0">
            <Home className="w-7 h-7 text-estate-green" />
          </div>
          <div>
            <p className="text-sm text-background/60 mb-1">Single-Property Prediction</p>
            <h2 className="text-2xl font-semibold mb-3">{result.winner}</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-estate-green"><CheckCircle2 className="w-4 h-4" /> Production Ready</span>
              <span className="text-background/40">·</span>
              <span className="text-background/60">MAPE {result.mape.toFixed(1)}%</span>
              <span className="text-background/40">·</span>
              <span className="text-background/60">R² {result.r2_score.toFixed(3)}</span>
              <span className="text-background/40">·</span>
              <span className="text-background/60">{properties.length} properties available</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mode toggle ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-1 bg-muted rounded-xl w-fit">
        <button
          onClick={() => { setMode("dataset"); resetResult() }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === "dataset" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <TableProperties className="w-4 h-4" /> Select from Dataset
        </button>
        <button
          onClick={() => { setMode("manual"); setSelected(null); resetResult() }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === "manual" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <PenLine className="w-4 h-4" /> Manual Entry
        </button>
      </div>

      {/* ── Dataset selector ─────────────────────────────────────────────────── */}
      {mode === "dataset" && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Browse Dataset</CardTitle>
                <p className="text-sm text-muted-foreground">Click any row to select a property and auto-fill the prediction form</p>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by zip, type, index..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-xl border border-border overflow-hidden mx-6 mb-6">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                    <tr>
                      {["#", "Sq Ft", "Beds", "Baths", "Cond.", "Zip Code", "Type", "AI Value"].map((h) => (
                        <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.property_idx}
                        onClick={() => selectProperty(p)}
                        className={`border-t border-border cursor-pointer transition-colors ${
                          selected?.property_idx === p.property_idx
                            ? "bg-estate-green/5 border-l-2 border-l-estate-green"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <td className="py-2.5 px-4 font-medium text-muted-foreground">#{p.property_idx}</td>
                        <td className="py-2.5 px-4">{p.sq_ft_total != null ? p.sq_ft_total.toLocaleString() : "—"}</td>
                        <td className="py-2.5 px-4">{p.bedrooms ?? "—"}</td>
                        <td className="py-2.5 px-4">{p.bathrooms ?? "—"}</td>
                        <td className="py-2.5 px-4">{p.condition_score ?? "—"}</td>
                        <td className="py-2.5 px-4">{p.zip_code ?? "—"}</td>
                        <td className="py-2.5 px-4 max-w-[120px] truncate">{p.property_type ?? "—"}</td>
                        <td className="py-2.5 px-4 font-mono text-estate-green">{fmt(p.ai_value)}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No properties found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {properties.length > filtered.length && (
                <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
                  Showing {filtered.length} of {properties.length} properties — use search to narrow down
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Prediction form ───────────────────────────────────────────────────── */}
      {(mode === "manual" || selected) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Home className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  {selected ? `Property #${selected.property_idx}` : "Manual Entry"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selected
                    ? "Fields pre-filled from dataset — edit any value before predicting"
                    : `Enter property attributes for an instant valuation using ${result.winner}`}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sqft">Sq Ft Total *</Label>
                <Input id="sqft" type="number" min="1" placeholder="e.g. 1500" value={sqFt}
                  onChange={(e) => { setSqFt(e.target.value); resetResult() }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cond">Condition Score (1–10)</Label>
                <Input id="cond" type="number" min="1" max="10" placeholder="e.g. 7" value={condScore}
                  onChange={(e) => { setCondScore(e.target.value); resetResult() }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="beds">Bedrooms</Label>
                <Input id="beds" type="number" min="0" placeholder="e.g. 3" value={bedrooms}
                  onChange={(e) => { setBedrooms(e.target.value); resetResult() }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="baths">Bathrooms</Label>
                <Input id="baths" type="number" min="0" placeholder="e.g. 2" value={bathrooms}
                  onChange={(e) => { setBathrooms(e.target.value); resetResult() }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">Zip Code</Label>
                <Input id="zip" placeholder="e.g. 10001" value={zipCode}
                  onChange={(e) => { setZipCode(e.target.value); resetResult() }} list="zip-options" />
                <datalist id="zip-options">
                  {availableZips.map((z) => <option key={z} value={z} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ptype">Property Type</Label>
                <Input id="ptype" placeholder="e.g. Condo" value={propertyType}
                  onChange={(e) => { setPropertyType(e.target.value); resetResult() }} list="ptype-options" />
                <datalist id="ptype-options">
                  {availablePropTypes.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
            </div>

            <Button onClick={handlePredict} disabled={loading || !sqFt} className="w-full mt-2 h-11 rounded-xl">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Predicting...</> : "Predict Price"}
            </Button>

            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
            )}

            {prediction !== null && (
              <div className="space-y-3">
                <div className="p-6 rounded-2xl bg-estate-green/5 border border-estate-green/20 text-center">
                  <p className="text-sm text-muted-foreground mb-1">AI Predicted Price</p>
                  <p className="text-4xl font-bold text-estate-green font-mono">
                    {fmt(prediction)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {result.winner} · MAPE {result.mape.toFixed(1)}% · R² {result.r2_score.toFixed(3)}
                  </p>
                </div>

                {selected && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-muted/40 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Training AI Value</p>
                      <p className="text-lg font-semibold font-mono text-estate-green">{fmt(selected.ai_value)}</p>
                    </div>
                    <div className={`p-4 rounded-xl text-center ${delta != null && Math.abs(delta) <= result.mape ? "bg-estate-green/5 border border-estate-green/20" : "bg-muted/40"}`}>
                      <p className="text-xs text-muted-foreground mb-1">vs Training AI Value</p>
                      <div className="flex items-center justify-center gap-1">
                        {delta != null && delta > 0 ? <TrendingUp className="w-4 h-4 text-estate-green" /> :
                         delta != null && delta < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> :
                         <Minus className="w-4 h-4 text-muted-foreground" />}
                        <p className={`text-lg font-semibold ${delta != null && delta > 0 ? "text-estate-green" : delta != null && delta < 0 ? "text-red-500" : "text-foreground"}`}>
                          {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      {delta != null && Math.abs(delta) <= result.mape && (
                        <p className="text-[10px] text-estate-green mt-1">Consistent with training-time valuation</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "dataset" && !selected && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
          <TableProperties className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">Click any row in the table above to select a property</p>
        </div>
      )}
    </div>
  )
}
