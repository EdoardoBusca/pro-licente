"use client"

import { useState, useMemo } from "react"
import {
  Sparkles, Check, AlertTriangle, X, ChevronDown, Info,
  ArrowRight, Loader2, RotateCcw,
} from "lucide-react"
import type { ColumnMappingResult, ColumnMappingEntry } from "@/src/types"

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_COLS = [
  "Date_Listed", "Property_Type", "Sq_Ft_Total",
  "Zip_Code", "Condition_Score", "List_Price", "Closing_Price",
]
const OPTIONAL_COLS = ["Bedrooms", "Bathrooms"]
const ALL_TARGET_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS]

const TRANSFORM_LABELS: Record<string, string> = {
  sqm_to_sqft:                    "× 10.764 (m² → ft²)",
  sqyd_to_sqft:                   "× 9 (yd² → ft²)",
  acres_to_sqft:                  "× 43,560 (acres → ft²)",
  inr_to_usd:                     "÷ 83 (INR → USD)",
  lakh_to_usd:                    "× 1,200 (Lakh INR → USD)",
  crore_to_usd:                   "× 120,000 (Crore INR → USD)",
  thousands_to_units:             "× 1,000 (thousands → units)",
  derive_condition_from_furnishing: "Derived from furnishing level",
  use_as_closing:                 "Copy of List Price column",
}

const TARGET_DESCRIPTIONS: Record<string, string> = {
  Date_Listed:     "When the property was listed for sale",
  Property_Type:   "Category (Apartment, House, Condo, Villa…)",
  Sq_Ft_Total:     "Total floor area in square feet",
  Zip_Code:        "Location: zip code, area name or neighbourhood",
  Condition_Score: "Property condition 1–10 scale",
  List_Price:      "Original asking / listing price",
  Closing_Price:   "Final sale price (or copy of List Price)",
  Bedrooms:        "Number of bedrooms",
  Bathrooms:       "Number of bathrooms",
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfirmedMapping = Record<string, { source: string | null; transform: string | null }>

interface ColumnMapperProps {
  mappingResult:  ColumnMappingResult
  onConfirm:      (mapping: ConfirmedMapping) => void
  onCancel:       () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(confidence: number) {
  if (confidence >= 0.80) return { label: "High",    bg: "#dcfce7", color: "#166534" }
  if (confidence >= 0.60) return { label: "Medium",  bg: "#fef9c3", color: "#854d0e" }
  return                          { label: "Low",     bg: "#fee2e2", color: "#991b1b" }
}

// ─── Row component ────────────────────────────────────────────────────────────

function MappingRow({
  targetCol,
  entry,
  allColumns,
  needsInput,
  value,
  onChange,
}: {
  targetCol:  string
  entry:      ColumnMappingEntry | undefined
  allColumns: string[]
  needsInput: boolean
  value:      { source: string | null; transform: string | null }
  onChange:   (v: { source: string | null; transform: string | null }) => void
}) {
  const badge = confidenceBadge(entry?.confidence ?? 0)
  const isRequired = REQUIRED_COLS.includes(targetCol)
  const transformLabel = value.transform ? TRANSFORM_LABELS[value.transform] : null

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${needsInput ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white"}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-[#0F172A]">{targetCol}</span>
            {isRequired ? (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] font-medium">required</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-[#64748B]">optional</span>
            )}
            {needsInput && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                <AlertTriangle className="w-3 h-3" /> Needs input
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">{TARGET_DESCRIPTIONS[targetCol]}</p>
        </div>
        {/* Confidence badge — only show if Gemini had a suggestion */}
        {entry && entry.source && (
          <span
            className="shrink-0 text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label} ({Math.round((entry.confidence) * 100)}%)
          </span>
        )}
      </div>

      {/* Source column selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1">
            Source Column
          </label>
          <div className="relative">
            <select
              value={value.source ?? ""}
              onChange={(e) => onChange({ ...value, source: e.target.value || null })}
              className={`w-full appearance-none rounded-lg border px-3 py-2.5 pr-8 text-sm text-[#0F172A] outline-none transition-all ${
                needsInput ? "border-amber-300 bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                           : "border-gray-200 bg-[#F8FAFC] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]"
              }`}
            >
              <option value="">— skip this column —</option>
              {allColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1">
            Transform / Conversion
          </label>
          <div className="relative">
            <select
              value={value.transform ?? ""}
              onChange={(e) => onChange({ ...value, transform: e.target.value || null })}
              className="w-full appearance-none rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 pr-8 text-sm text-[#0F172A] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
            >
              <option value="">None (rename only)</option>
              {Object.entries(TRANSFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>
      </div>

      {/* Transform note */}
      {transformLabel && (
        <div className="flex items-center gap-2 text-xs text-[#64748B] bg-[#F8FAFC] rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 text-[#3B82F6]" />
          Will apply: <span className="font-medium text-[#334155]">{transformLabel}</span>
        </div>
      )}

      {/* AI reason */}
      {entry?.reason && (
        <p className="text-xs text-[#64748B] italic">{entry.reason}</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ColumnMapper({ mappingResult, onConfirm, onCancel }: ColumnMapperProps) {
  const initialState = useMemo<ConfirmedMapping>(() => {
    const out: ConfirmedMapping = {}
    for (const col of ALL_TARGET_COLS) {
      const entry = mappingResult.mappings?.[col]
      out[col] = {
        source:    entry?.source    ?? null,
        transform: entry?.transform ?? null,
      }
    }
    return out
  }, [mappingResult])

  const [mapping, setMapping] = useState<ConfirmedMapping>(initialState)

  const missingRequired = REQUIRED_COLS.filter(
    (col) => !mapping[col]?.source
  )

  const handleConfirm = () => {
    // Only send columns that have a source
    const filtered: ConfirmedMapping = {}
    for (const [col, val] of Object.entries(mapping)) {
      if (val.source) filtered[col] = val
    }
    onConfirm(filtered)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-[#F8FAFF] to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">AI Column Mapping</h2>
              <p className="text-xs text-[#64748B]">Powered by Gemini · Review and confirm before training</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary banner */}
        {mappingResult.summary && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-start gap-2.5 shrink-0">
            <Info className="w-4 h-4 text-[#1D4ED8] mt-0.5 shrink-0" />
            <p className="text-sm text-[#1E40AF]">{mappingResult.summary}</p>
          </div>
        )}

        {/* Scrollable mapping rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Required */}
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B] pb-1">Required Columns</p>
          {REQUIRED_COLS.map((col) => (
            <MappingRow
              key={col}
              targetCol={col}
              entry={mappingResult.mappings?.[col]}
              allColumns={mappingResult.all_columns ?? []}
              needsInput={mappingResult.needs_user_input?.includes(col) || !mappingResult.mappings?.[col]?.source}
              value={mapping[col]}
              onChange={(v) => setMapping((prev) => ({ ...prev, [col]: v }))}
            />
          ))}

          {/* Optional */}
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B] pb-1 pt-3">Optional Columns</p>
          {OPTIONAL_COLS.map((col) => (
            <MappingRow
              key={col}
              targetCol={col}
              entry={mappingResult.mappings?.[col]}
              allColumns={mappingResult.all_columns ?? []}
              needsInput={false}
              value={mapping[col]}
              onChange={(v) => setMapping((prev) => ({ ...prev, [col]: v }))}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-[#FAFCFF] shrink-0">
          {missingRequired.length > 0 && (
            <div className="flex items-center gap-2 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Still unmapped: <span className="font-medium">{missingRequired.join(", ")}</span>
              <span className="text-amber-600">— training may fail without these.</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#334155] hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
            >
              <Check className="w-4 h-4" />
              Confirm &amp; Train
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
