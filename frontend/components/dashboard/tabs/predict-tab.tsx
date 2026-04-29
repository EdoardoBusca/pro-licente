"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Home, CheckCircle2 } from "lucide-react"
import { predictSingle } from "@/src/api"
import type { TrainingResult } from "@/src/types"

interface PredictTabProps {
  jobId: string
  result: TrainingResult
}

export function PredictTab({ jobId, result }: PredictTabProps) {
  const [sqFt,         setSqFt]         = useState("")
  const [bedrooms,     setBedrooms]     = useState("")
  const [bathrooms,    setBathrooms]    = useState("")
  const [condScore,    setCondScore]    = useState("")
  const [zipCode,      setZipCode]      = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [prediction,   setPrediction]   = useState<number | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const resetResult = () => { setPrediction(null); setError(null) }

  const [availableZips, availablePropTypes] = useMemo(() => {
    const keys = Object.keys(result.correlation_lookup)
    return [
      keys.filter((k) => k.startsWith("Zip_Code_")).map((k) => k.replace("Zip_Code_", "")),
      keys.filter((k) => k.startsWith("Property_Type_")).map((k) => k.replace("Property_Type_", "")),
    ]
  }, [result.correlation_lookup])

  const handlePredict = async () => {
    if (!sqFt) return
    setLoading(true)
    setError(null)
    setPrediction(null)
    try {
      const res = await predictSingle(jobId, {
        sq_ft_total:     parseFloat(sqFt),
        bedrooms:        bedrooms     ? parseFloat(bedrooms)  : undefined,
        bathrooms:       bathrooms    ? parseFloat(bathrooms) : undefined,
        condition_score: condScore    ? parseFloat(condScore) : undefined,
        zip_code:        zipCode      || undefined,
        property_type:   propertyType || undefined,
      })
      console.log("[predict] feature inputs sent to model:", res.debug_inputs)
      setPrediction(res.predicted_price)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Prediction failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">

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
            </div>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Single-Property Prediction</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter property attributes to get an instant AI valuation using <span className="font-medium">{result.winner}</span>
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
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Predicting...</>
              : "Predict Price"}
          </Button>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {prediction !== null && (
            <div className="p-6 rounded-2xl bg-estate-green/5 border border-estate-green/20 text-center">
              <p className="text-sm text-muted-foreground mb-1">Estimated Market Value</p>
              <p className="text-4xl font-bold text-estate-green font-mono">
                ${prediction.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {result.winner} · MAPE {result.mape.toFixed(1)}% · R² {result.r2_score.toFixed(3)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
