"use client"

import { useState } from "react"
import { Sparkles, ChevronDown, ChevronUp, Loader2, AlertTriangle, RefreshCw } from "lucide-react"

interface AiAdvicePanelProps {
  advice:     string | null
  isLoading:  boolean
  error:      string | null
  onRefresh?: () => void
}

function renderAdvice(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      elements.push(<div key={key++} className="h-1.5" />)
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={key++} className="text-sm font-semibold text-foreground mt-3 first:mt-0">
          {trimmed.replace(/^## /, "")}
        </p>
      )
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <p key={key++} className="text-sm text-muted-foreground flex gap-2">
          <span className="text-muted-foreground/50 shrink-0">·</span>
          {trimmed.slice(2)}
        </p>
      )
    } else {
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/)
      elements.push(
        <p key={key++} className="text-sm text-muted-foreground leading-relaxed">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={i} className="font-semibold text-foreground">{part.replace(/\*\*/g, "")}</strong>
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
    <div className="mx-8 mb-0 mt-4 rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">AI Investment Insights</span>
          {isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && !isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh() }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              title="Regenerate"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border">
          {isLoading && (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Reading dataset results and generating investment advice…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 py-3 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-foreground">Could not generate advice</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}
          {advice && !isLoading && (
            <div className="pt-3 space-y-1">
              {renderAdvice(advice)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
