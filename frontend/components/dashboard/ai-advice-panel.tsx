"use client"

import { useState } from "react"
import { Sparkles, ChevronDown, ChevronUp, Loader2, AlertTriangle, RefreshCw } from "lucide-react"

interface AiAdvicePanelProps {
  advice:     string | null
  isLoading:  boolean
  error:      string | null
  onRefresh?: () => void
}

// Very simple markdown → JSX renderer for the subset Gemini returns
function renderAdvice(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />)
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-[#0F172A] mt-4 first:mt-0">
          {trimmed.replace(/^## /, "")}
        </h3>
      )
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      elements.push(
        <p key={key++} className="text-sm font-semibold text-[#1E293B]">
          {trimmed.replace(/\*\*/g, "")}
        </p>
      )
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <p key={key++} className="text-sm text-[#334155] flex gap-2">
          <span className="text-[#94A3B8] shrink-0">•</span>
          {trimmed.slice(2)}
        </p>
      )
    } else {
      // Inline bold within paragraph
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/)
      elements.push(
        <p key={key++} className="text-sm text-[#334155] leading-relaxed">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={i} className="font-semibold text-[#0F172A]">{part.replace(/\*\*/g, "")}</strong>
              : part
          )}
        </p>
      )
    }
  }
  return elements
}

export function AiAdvicePanel({ advice, isLoading, error, onRefresh }: AiAdvicePanelProps) {
  const [expanded, setExpanded] = useState(true)

  if (!isLoading && !advice && !error) return null

  return (
    <div className="mx-8 mb-0 mt-4 rounded-xl border border-[#C4B5FD]/40 bg-gradient-to-r from-[#F5F3FF] to-[#FAF7FF] shadow-[0_2px_12px_rgba(79,70,229,0.08)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 hover:bg-[#EDE9FE]/30 transition-colors cursor-pointer" onClick={() => setExpanded((p) => !p)}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-[#3730A3]">AI Investment Insights</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#4F46E5] font-medium">Gemini</span>
          {isLoading && (
            <span className="flex items-center gap-1 text-xs text-[#6D28D9]">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && !isLoading && (
            <div
              onClick={(e) => { e.stopPropagation(); onRefresh() }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-[#6D28D9] hover:bg-[#EDE9FE] transition-colors cursor-pointer"
              title="Regenerate advice"
            >
              <RefreshCw className="w-3 h-3" />
            </div>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[#6D28D9]" />
            : <ChevronDown className="w-4 h-4 text-[#6D28D9]" />
          }
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-[#C4B5FD]/30">
          {isLoading && (
            <div className="flex items-center gap-3 py-4 text-sm text-[#6D28D9]">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Gemini is reading your dataset results and generating personalized investment advice…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 py-3 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Could not generate advice</p>
                <p className="text-xs mt-0.5 text-amber-600">{error}</p>
              </div>
            </div>
          )}
          {advice && !isLoading && (
            <div className="pt-3 space-y-0.5">
              {renderAdvice(advice)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
