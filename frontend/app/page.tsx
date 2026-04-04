"use client"

import { useState, useCallback } from "react"
import { Hero } from "@/components/landing/hero"
import { LoadingTransition } from "@/components/landing/loading-transition"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ModelStatsTab } from "@/components/dashboard/tabs/model-stats"
import { ValuationEngineTab } from "@/components/dashboard/tabs/valuation-engine"
import { MarketDynamicsTab } from "@/components/dashboard/tabs/market-dynamics"
import { MarketInventoryTab } from "@/components/dashboard/tabs/market-inventory"
import { PredictTab } from "@/components/dashboard/tabs/predict-tab"
import {
  BarChart3, Settings2, Activity, Building2, PanelLeftOpen, Loader2,
  Moon, Sun, Download, RotateCcw, Home,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { startTraining, waitForTrainingCompletion, simulateMarketScenario } from "@/src/api"
import type { TrainingResult } from "@/src/types"

type AppState = "landing" | "loading" | "dashboard"

export default function App() {
  const [appState,  setAppState]  = useState<AppState>(() =>
    typeof window !== "undefined" && sessionStorage.getItem("ev-result") ? "dashboard" : "landing"
  )
  const [activeTab, setActiveTab] = useState("model-stats")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Training state — restore last session from sessionStorage
  const [file,     setFile]     = useState<File | null>(null)
  const [target,   setTarget]   = useState("Closing_Price")
  const [horizon,  setHorizon]  = useState("180")
  const [isTraining, setIsTraining] = useState(false)
  const [result,   setResult]   = useState<TrainingResult | null>(() => {
    try { const s = sessionStorage.getItem("ev-result"); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [error,    setError]    = useState<string | null>(null)
  const [jobId,    setJobId]    = useState<string | null>(() => sessionStorage.getItem("ev-job-id"))
  const [pollProgress, setPollProgress] = useState<{ attempt: number; max: number } | null>(null)

  // Theme — persist across reloads
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false
    const saved = localStorage.getItem("ev-dark")
    if (saved !== null) return saved === "1"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })

  // Apply theme class on first render
  useState(() => {
    if (typeof window !== "undefined")
      document.documentElement.classList.toggle("dark", isDark)
  })

  const handleToggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle("dark", next)
      localStorage.setItem("ev-dark", next ? "1" : "0")
      return next
    })
  }, [])

  const handleEnterDashboard = useCallback(() => {
    setAppState("loading")
  }, [])

  const handleLoadingComplete = useCallback(() => {
    setAppState("dashboard")
  }, [])

  const handleReset = useCallback(() => {
    setResult(null)
    setJobId(null)
    setError(null)
    setPollProgress(null)
    sessionStorage.removeItem("ev-result")
    sessionStorage.removeItem("ev-job-id")
  }, [])

  const handleInitialize = useCallback(async () => {
    if (!file || !target) return
    setIsTraining(true)
    setError(null)
    setResult(null)
    setPollProgress(null)

    try {
      const started = await startTraining(file, target, parseInt(horizon))
      if (!started?.job_id) throw new Error("Backend did not return a job_id.")
      if (started?.status === "failed") throw new Error(started?.error || "Training failed.")

      setJobId(started.job_id)
      sessionStorage.setItem("ev-job-id", started.job_id)

      const data = await waitForTrainingCompletion(
        started.job_id,
        (attempt, max) => setPollProgress({ attempt, max }),
      )
      setResult(data)
      sessionStorage.setItem("ev-result", JSON.stringify(data))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setError(msg)
    } finally {
      setIsTraining(false)
      setPollProgress(null)
    }
  }, [file, target, horizon])

  const handleExportJSON = useCallback(() => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `estate-report-${jobId ?? "result"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [result, jobId])

  const handleMarketScenarioChange = useCallback(async ({
    sliderValue, renovationPackage, forecastHorizonMonths, baseValuation, marketCycle,
  }: {
    sliderValue: number
    renovationPackage: "basic" | "midrange" | "luxury" | "structural"
    forecastHorizonMonths: number
    baseValuation: number
    marketCycle: string
  }) => {
    if (!result) return { adjustedValuation: 0, conditionImpact: "No training result is available yet." }
    return simulateMarketScenario({ baseValuation, sliderValue, marketCycle, renovationPackage, forecastHorizonMonths })
  }, [result])

  if (appState === "landing") {
    return <Hero onEnterDashboard={handleEnterDashboard} />
  }

  if (appState === "loading") {
    return <LoadingTransition onComplete={handleLoadingComplete} />
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0 overflow-hidden"}`}>
        <Sidebar
          file={file}
          target={target}
          horizon={horizon}
          isTraining={isTraining}
          onFileChange={setFile}
          onTargetChange={setTarget}
          onHorizonChange={setHorizon}
          onInitialize={handleInitialize}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>

      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-5 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <Button variant="outline" size="icon" onClick={() => setSidebarOpen(true)}
                className="h-10 w-10 rounded-xl border-border hover:bg-muted">
                <PanelLeftOpen className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-semibold">Analytics Dashboard</h1>
              <p className="text-sm text-muted-foreground">Real-time property valuations and market insights</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark mode toggle */}
            <Button variant="outline" size="icon" onClick={handleToggleDark}
              className="h-9 w-9 rounded-xl border-border hover:bg-muted">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Export JSON */}
            {result && (
              <Button variant="outline" size="sm" onClick={handleExportJSON}
                className="gap-2 rounded-xl border-border hover:bg-muted">
                <Download className="w-4 h-4" />
                Export JSON
              </Button>
            )}

            {/* New Training */}
            {result && !isTraining && (
              <Button variant="outline" size="sm" onClick={handleReset}
                className="gap-2 rounded-xl border-border hover:bg-muted">
                <RotateCcw className="w-4 h-4" />
                New Training
              </Button>
            )}

            {/* Status badge */}
            {isTraining ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-estate-amber/10 text-estate-amber text-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>
                  {pollProgress
                    ? `Training... (poll ${pollProgress.attempt}/${pollProgress.max})`
                    : "Training models..."}
                </span>
              </div>
            ) : result ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-estate-green/10 text-estate-green text-sm">
                <span className="w-2 h-2 bg-estate-green rounded-full animate-pulse" />
                <span>Engine Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
                <span>Awaiting Data</span>
              </div>
            )}
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mx-8 mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleInitialize}
              disabled={!file || !target}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10">
              Retry
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex-1 p-8 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 bg-card border border-border p-1.5 rounded-xl h-auto">
              <TabsTrigger value="model-stats" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <BarChart3 className="w-4 h-4" /> Model Stats
              </TabsTrigger>
              <TabsTrigger value="valuation-engine" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <Settings2 className="w-4 h-4" /> Valuation Engine
              </TabsTrigger>
              <TabsTrigger value="market-dynamics" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <Activity className="w-4 h-4" /> Market Dynamics
              </TabsTrigger>
              <TabsTrigger value="market-inventory" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <Building2 className="w-4 h-4" /> Market Inventory
              </TabsTrigger>
              <TabsTrigger value="predict" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <Home className="w-4 h-4" /> Predict
              </TabsTrigger>
            </TabsList>

            <TabsContent value="model-stats" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result ? <ModelStatsTab result={result} /> : <LockedState icon={<BarChart3 className="w-6 h-6" />} label="Model Stats" />}
            </TabsContent>

            <TabsContent value="valuation-engine" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result ? <ValuationEngineTab result={result} /> : <LockedState icon={<Settings2 className="w-6 h-6" />} label="Valuation Engine" />}
            </TabsContent>

            <TabsContent value="market-dynamics" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result
                ? <MarketDynamicsTab result={result} onSliderChange={handleMarketScenarioChange} />
                : <LockedState icon={<Activity className="w-6 h-6" />} label="Market Dynamics" />}
            </TabsContent>

            <TabsContent value="market-inventory" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result ? <MarketInventoryTab result={result} /> : <LockedState icon={<Building2 className="w-6 h-6" />} label="Market Inventory" />}
            </TabsContent>

            <TabsContent value="predict" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result && jobId
                ? <PredictTab jobId={jobId} result={result} />
                : <LockedState icon={<Home className="w-6 h-6" />} label="Single-Property Prediction" />}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}

function LockedState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] gap-4 text-muted-foreground">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground">{label}</p>
        <p className="text-sm mt-1 max-w-xs">Upload a dataset and initialize the engine to unlock this view.</p>
      </div>
    </div>
  )
}
