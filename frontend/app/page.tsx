"use client"

import { useState, useCallback, useEffect } from "react"
import { Hero } from "@/components/landing/hero"
import { LoadingTransition } from "@/components/landing/loading-transition"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ModelStatsTab } from "@/components/dashboard/tabs/model-stats"
import { ValuationEngineTab } from "@/components/dashboard/tabs/valuation-engine"
import { MarketDynamicsTab } from "@/components/dashboard/tabs/market-dynamics"
import { MarketInventoryTab } from "@/components/dashboard/tabs/market-inventory"
import { PredictTab } from "@/components/dashboard/tabs/predict-tab"
import { InvestmentCalculatorTab } from "@/components/dashboard/tabs/investment-calculator"
import { CashFlowTab } from "@/components/dashboard/tabs/cash-flow"
import { ColumnMapper } from "@/components/dashboard/column-mapper"
import { AiAdvicePanel } from "@/components/dashboard/ai-advice-panel"
import {
  BarChart3, Settings2, Activity, Building2, PanelLeftOpen, Loader2,
  Moon, Sun, Download, RotateCcw, Home, Calculator, TrendingUp, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { startTraining, waitForTrainingCompletion, simulateMarketScenario, mapColumns, getAiAdvice, logout, getStoredUser } from "@/src/api"
import { downloadPDF } from "@/components/dashboard/report-pdf"
import type { TrainingResult, ColumnMappingResult } from "@/src/types"
import type { ConfirmedMapping } from "@/components/dashboard/column-mapper"

type AppState = "landing" | "loading" | "dashboard"

export default function App() {
  // Always start with safe server-side defaults — load from storage after mount
  const [appState,  setAppState]  = useState<AppState>("landing")
  const [activeTab, setActiveTab] = useState("model-stats")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Training state
  const [file,       setFile]       = useState<File | null>(null)
  const [target,     setTarget]     = useState("Closing_Price")
  const [horizon,    setHorizon]    = useState("180")
  const [isTraining, setIsTraining] = useState(false)
  const [result,     setResult]     = useState<TrainingResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [jobId,      setJobId]      = useState<string | null>(null)
  const [pollProgress, setPollProgress] = useState<{ attempt: number; max: number } | null>(null)

  // Column mapping state
  const [mappingResult,    setMappingResult]    = useState<ColumnMappingResult | null>(null)
  const [isMappingLoading, setIsMappingLoading] = useState(false)
  const [showMapper,       setShowMapper]       = useState(false)
  const [confirmedMapping, setConfirmedMapping] = useState<ConfirmedMapping | null>(null)

  // AI advice state
  const [aiAdvice,        setAiAdvice]        = useState<string | null>(null)
  const [isAdviceLoading, setIsAdviceLoading] = useState(false)
  const [adviceError,     setAdviceError]     = useState<string | null>(null)

  // PDF export state
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  // Theme — always false on server, real value loaded after mount
  const [isDark, setIsDark] = useState(false)

  // Restore persisted session after mount (client-only)
  useEffect(() => {
    // Auth guard — redirect to login if no token
    const token = localStorage.getItem("ev-token")
    if (!token) {
      window.location.href = "/login"
      return
    }

    try {
      const savedResult = sessionStorage.getItem("ev-result")
      const savedJobId  = sessionStorage.getItem("ev-job-id")
      if (savedResult) {
        setResult(JSON.parse(savedResult))
        setAppState("dashboard")
      }
      if (savedJobId) setJobId(savedJobId)
    } catch { /* ignore */ }

    // Theme
    const savedDark = localStorage.getItem("ev-dark")
    const prefersDark = savedDark !== null
      ? savedDark === "1"
      : window.matchMedia("(prefers-color-scheme: dark)").matches
    setIsDark(prefersDark)
    document.documentElement.classList.toggle("dark", prefersDark)
  }, [])

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

  // When a file is selected, call Gemini to map columns — always show the modal
  const handleFileChange = useCallback(async (f: File | null) => {
    setFile(f)
    setMappingResult(null)
    setConfirmedMapping(null)
    setShowMapper(false)
    if (!f) return
    setIsMappingLoading(true)
    try {
      const result = await mapColumns(f)
      // Even if Gemini errored, still show the modal with whatever columns came back
      // so the user can map manually
      const fallback: import("@/src/types").ColumnMappingResult = result?.error
        ? { mappings: {}, needs_user_input: [], summary: "Gemini unavailable — please map columns manually.", all_columns: [] }
        : result
      setMappingResult(fallback)
      setShowMapper(true)
    } catch {
      // Backend unreachable — show empty mapper so user can still map manually
      setMappingResult({ mappings: {}, needs_user_input: [], summary: "Could not reach backend — please map columns manually.", all_columns: [] })
      setShowMapper(true)
    } finally {
      setIsMappingLoading(false)
    }
  }, [])

  const fetchAiAdvice = useCallback(async (trainingResult: TrainingResult) => {
    setIsAdviceLoading(true)
    setAdviceError(null)
    try {
      const yoyMetrics = trainingResult.market_dynamics?.temporal_analysis?.yoy_appreciation_metrics ?? []
      const avgYoy = yoyMetrics.length
        ? yoyMetrics.reduce((s, m) => s + (m.yoy_appreciation ?? 0), 0) / yoyMetrics.length
        : 0

      // Extract unique locations and property types from feature names
      const featureNames = (trainingResult.feature_importance ?? []).map((f) => f.feature)
      const locations    = featureNames.filter((f) => f.startsWith("Zip_Code_")).map((f) => f.replace("Zip_Code_", "")).slice(0, 8)
      const propTypes    = featureNames.filter((f) => f.startsWith("Property_Type_")).map((f) => f.replace("Property_Type_", "")).slice(0, 6)

      const payload = {
        total_rows:            trainingResult.train_size + trainingResult.test_size,
        locations:             locations.length ? locations : ["N/A"],
        property_types:        propTypes.length ? propTypes : ["N/A"],
        avg_price:             trainingResult.market_dynamics?.price_discovery?.find((d) => d.kind === "final")?.change ?? 0,
        min_price:             trainingResult.arbitrage?.buy_signals?.[trainingResult.arbitrage.buy_signals.length - 1]?.list_price ?? 0,
        max_price:             trainingResult.arbitrage?.risk_signals?.[0]?.list_price ?? 0,
        winner_model:          trainingResult.winner,
        mape:                  trainingResult.mape,
        r2:                    trainingResult.r2_score,
        market_cycle:          trainingResult.market_dynamics?.temporal_analysis?.market_cycle ?? "Balanced",
        yoy_appreciation:      parseFloat(avgYoy.toFixed(2)),
        liquidity_score:       trainingResult.market_dynamics?.sales_velocity?.liquidity_score ?? 0,
        expected_days_to_sell: trainingResult.market_dynamics?.sales_velocity?.expected_days_to_sell ?? null,
        buy_signals_count:     trainingResult.arbitrage?.undervalued_count ?? 0,
        risk_signals_count:    trainingResult.arbitrage?.overpriced_count ?? 0,
        mean_delta_pct:        trainingResult.arbitrage?.valuation_delta_stats?.mean_delta_pct ?? 0,
        confidence_level:      trainingResult.model_diagnostics?.confidence_level ?? "Medium",
      }
      const res = await getAiAdvice(payload)
      if (res?.error) setAdviceError(res.error)
      else setAiAdvice(res?.advice ?? null)
    } catch (err: unknown) {
      setAdviceError(err instanceof Error ? err.message : "Failed to fetch AI advice")
    } finally {
      setIsAdviceLoading(false)
    }
  }, [])

  const handleInitialize = useCallback(async () => {
    if (!file || !target) return
    setIsTraining(true)
    setError(null)
    setResult(null)
    setPollProgress(null)
    setAiAdvice(null)
    setAdviceError(null)

    try {
      const started = await startTraining(file, target, parseInt(horizon), confirmedMapping)
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
      // Fire AI advice in background after training
      fetchAiAdvice(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setError(msg)
    } finally {
      setIsTraining(false)
      setPollProgress(null)
    }
  }, [file, target, horizon, confirmedMapping, fetchAiAdvice])

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
          isMappingLoading={isMappingLoading}
          mappingReady={!!mappingResult && !confirmedMapping}
          mappingConfirmed={!!confirmedMapping}
          onFileChange={handleFileChange}
          onTargetChange={setTarget}
          onHorizonChange={setHorizon}
          onInitialize={handleInitialize}
          onReviewMapping={() => setShowMapper(true)}
          onCollapse={() => setSidebarOpen(false)}
          currentUser={getStoredUser()}
          onLogout={logout}
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

            {/* Export PDF */}
            {result && (
              <Button variant="outline" size="sm"
                onClick={async () => {
                  setIsPdfLoading(true)
                  try { await downloadPDF(result, aiAdvice) }
                  finally { setIsPdfLoading(false) }
                }}
                disabled={isPdfLoading}
                className="gap-2 rounded-xl border-border hover:bg-muted">
                {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isPdfLoading ? "Generating…" : "Export PDF"}
              </Button>
            )}

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

        {/* AI Advice Panel */}
        <AiAdvicePanel
          advice={aiAdvice}
          isLoading={isAdviceLoading}
          error={adviceError}
          onRefresh={result ? () => fetchAiAdvice(result) : undefined}
        />

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
              <TabsTrigger value="investment-calculator" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <Calculator className="w-4 h-4" /> Investment
              </TabsTrigger>
              <TabsTrigger value="cash-flow" className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm transition-all">
                <TrendingUp className="w-4 h-4" /> Cash Flow
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

            <TabsContent value="investment-calculator" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result
                ? <InvestmentCalculatorTab result={result} />
                : <LockedState icon={<Calculator className="w-6 h-6" />} label="Investment Calculator" />}
            </TabsContent>

            <TabsContent value="cash-flow" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {result
                ? <CashFlowTab result={result} />
                : <LockedState icon={<TrendingUp className="w-6 h-6" />} label="Cash Flow & Returns" />}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Column Mapper Modal */}
      {showMapper && mappingResult && (
        <ColumnMapper
          mappingResult={mappingResult}
          onConfirm={(confirmed) => {
            setConfirmedMapping(confirmed)
            setShowMapper(false)
          }}
          onCancel={() => setShowMapper(false)}
        />
      )}
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
