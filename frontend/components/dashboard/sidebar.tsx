"use client"

import { useState, useCallback } from "react"
import { Upload, FileSpreadsheet, AlertTriangle, Check, Building2, ArrowRight, Sparkles, X, Loader2 } from "lucide-react"
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
  onFileChange: (file: File | null) => void
  onTargetChange: (target: string) => void
  onHorizonChange: (horizon: string) => void
  onInitialize: () => void
  onCollapse?: () => void
}

export function Sidebar({
  file,
  target,
  horizon,
  isTraining,
  onFileChange,
  onTargetChange,
  onHorizonChange,
  onInitialize,
  onCollapse,
}: SidebarProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        const f = files[0]
        if (f.name.endsWith(".csv") || f.name.endsWith(".xlsx")) {
          onFileChange(f)
        }
      }
    },
    [onFileChange]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) onFileChange(files[0])
  }

  const canInitialize = file !== null && target !== "" && !isTraining

  return (
    <aside className="w-80 min-h-screen bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="font-semibold text-base tracking-tight">Estate Vantage</h1>
              <p className="text-xs text-muted-foreground">Analytics Platform</p>
            </div>
          </div>
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              className="h-8 w-8 rounded-lg hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Upload Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Data Source
            </span>
          </div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 cursor-pointer
              ${
                isDragging
                  ? "border-foreground bg-muted/50 scale-[1.02]"
                  : file
                  ? "border-estate-green/50 bg-estate-green/5"
                  : "border-border hover:border-foreground/30 hover:bg-muted/30"
              }
            `}
          >
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-estate-green/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-estate-green" />
                </div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-estate-green" />
                  <span className="text-sm font-medium truncate max-w-[160px]">{file.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">Click to replace</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Drop your dataset</p>
                  <p className="text-xs text-muted-foreground mt-1">CSV or XLSX files</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Configuration
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground">Target Variable</label>
            <Select value={target} onValueChange={onTargetChange}>
              <SelectTrigger className="w-full bg-background border-border">
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

          <div className="space-y-2">
            <label className="text-sm text-foreground">Forecast Horizon</label>
            <Select value={horizon} onValueChange={onHorizonChange}>
              <SelectTrigger className="w-full bg-background border-border">
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
        </div>

        {/* Initialize Button */}
        <Button
          onClick={onInitialize}
          className="w-full h-12 rounded-xl gap-2 group"
          disabled={!canInitialize}
        >
          {isTraining ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Training Models...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Initialize Engine
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </Button>
      </div>

      {/* Data Quality Notice */}
      <div className="p-6 border-t border-border">
        <div className="flex gap-3 p-4 rounded-xl bg-estate-amber/5 border border-estate-amber/20">
          <AlertTriangle className="w-4 h-4 text-estate-amber shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Data Requirements:</span> Include property
            addresses, square footage, and sale prices for optimal accuracy.
          </div>
        </div>
      </div>
    </aside>
  )
}
