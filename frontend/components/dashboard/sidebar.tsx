"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Upload, FileSpreadsheet, Check, Building2, Sparkles, X,
  Loader2, Wand2, LogOut, User, ShieldCheck, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SidebarProps {
  file: File | null
  target: string
  horizon: string
  isTraining: boolean
  isMappingLoading?: boolean
  mappingReady?: boolean
  mappingConfirmed?: boolean
  onFileChange: (file: File | null) => void
  onTargetChange: (target: string) => void
  onHorizonChange: (horizon: string) => void
  onInitialize: () => void
  onReviewMapping?: () => void
  onCollapse?: () => void
  currentUser?: { name: string; email: string; role: string } | null
  onLogout?: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Sidebar({
  file,
  target,
  horizon,
  isTraining,
  isMappingLoading = false,
  mappingReady = false,
  mappingConfirmed = false,
  onFileChange,
  onTargetChange,
  onHorizonChange,
  onInitialize,
  onReviewMapping,
  onCollapse,
  currentUser,
  onLogout,
}: SidebarProps) {
  const router = useRouter()
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files[0]
      if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) onFileChange(f)
    },
    [onFileChange],
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFileChange(f)
  }

  const needsMapping  = file !== null && !mappingConfirmed && !isMappingLoading
  const canInitialize = file !== null && target !== "" && !isTraining && !needsMapping

  return (
    <aside className="w-80 min-h-screen bg-card border-r border-border flex flex-col">

      {/* ── Logo ───────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-background" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight leading-none">Estate Vantage</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Analytics Platform</p>
          </div>
        </div>
        {onCollapse && (
          <button onClick={onCollapse}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* Dataset upload */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Dataset</p>

          {file ? (
            /* ── File loaded state ── */
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate leading-tight">{file.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatBytes(file.size)}</p>
              </div>
              {/* Re-upload trigger wrapping a hidden input */}
              <label className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0">
                <input type="file" accept=".csv,.xlsx" onChange={handleFileInput} className="hidden" />
                <X className="w-3.5 h-3.5" />
              </label>
            </div>
          ) : (
            /* ── Empty drop zone ── */
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                block rounded-xl border-2 border-dashed px-5 py-6 text-center cursor-pointer
                transition-all duration-200
                ${isDragging
                  ? "border-foreground bg-muted/50 scale-[1.01]"
                  : "border-border hover:border-foreground/30 hover:bg-muted/20"
                }
              `}
            >
              <input type="file" accept=".csv,.xlsx" onChange={handleFileInput} className="hidden" />
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                <Upload className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Drop your dataset</p>
              <p className="text-[11px] text-muted-foreground mt-1">CSV or XLSX · click to browse</p>
            </label>
          )}
        </section>

        {/* Column mapping status */}
        {file && (isMappingLoading || mappingReady || mappingConfirmed) && (
          <section>
            {isMappingLoading && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted border border-border text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                Detecting column structure…
              </div>
            )}

            {mappingConfirmed && !isMappingLoading && (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  Columns confirmed
                </div>
                {onReviewMapping && (
                  <button onClick={onReviewMapping}
                    className="text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                    Edit
                  </button>
                )}
              </div>
            )}

            {mappingReady && !mappingConfirmed && !isMappingLoading && (
              <button
                onClick={onReviewMapping}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <Wand2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  Columns mapped — review
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </section>
        )}

        {/* Configuration */}
        <section className="space-y-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Configuration</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Target Variable</label>
            <Select value={target} onValueChange={onTargetChange}>
              <SelectTrigger className="w-full bg-background border-border text-sm h-9 rounded-lg">
                <SelectValue placeholder="Select variable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Closing_Price">Closing Price</SelectItem>
                <SelectItem value="Sale_Price">Sale Price</SelectItem>
                <SelectItem value="List_Price">List Price</SelectItem>
                <SelectItem value="Price_Per_SqFt">Price per Sq Ft</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Forecast Horizon</label>
            <Select value={horizon} onValueChange={onHorizonChange}>
              <SelectTrigger className="w-full bg-background border-border text-sm h-9 rounded-lg">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="180">6 Months</SelectItem>
                <SelectItem value="365">1 Year</SelectItem>
                <SelectItem value="1825">5 Years</SelectItem>
                <SelectItem value="3650">10 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* CTA */}
        {needsMapping && !isMappingLoading ? (
          <button
            onClick={onReviewMapping}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Wand2 className="w-4 h-4" />
            Review Column Mapping
          </button>
        ) : (
          <Button
            onClick={onInitialize}
            className="w-full h-11 rounded-xl gap-2 group"
            disabled={!canInitialize}
          >
            {isTraining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Training Models…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Initialize Engine
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
        )}

        {/* Requirements note — only shown when no file loaded */}
        {!file && (
          <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
            Include property addresses, square footage, and sale prices for best accuracy.
          </p>
        )}
      </div>

      {/* ── User footer ─────────────────────────────────────────────────────── */}
      {currentUser && (
        <div className="px-5 py-4 border-t border-border space-y-2">
          {currentUser.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Panel
            </button>
          )}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-background" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{currentUser.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{currentUser.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
