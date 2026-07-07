# Graph Report - pro-licente  (2026-07-07)

## Corpus Check
- 54 files · ~17,940,001 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 436 nodes · 807 edges · 27 communities (22 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `36314247`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_cn|cn]]
- [[_COMMUNITY_auth.py|auth.py]]
- [[_COMMUNITY_training.py|training.py]]
- [[_COMMUNITY_main.py|main.py]]
- [[_COMMUNITY_investment-calculator.tsx|investment-calculator.tsx]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_VantagePoint — Project Context for Next Agent|VantagePoint — Project Context for Next Agent]]
- [[_COMMUNITY_components.json|components.json]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_select.tsx|select.tsx]]
- [[_COMMUNITY_column-mapper.tsx|column-mapper.tsx]]
- [[_COMMUNITY_api.ts|api.ts]]
- [[_COMMUNITY_model_store.py|model_store.py]]
- [[_COMMUNITY_convert-dataset.py|convert-dataset.py]]
- [[_COMMUNITY_layout.tsx|layout.tsx]]
- [[_COMMUNITY_hero.tsx|hero.tsx]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_ai-advice-panel.tsx|ai-advice-panel.tsx]]
- [[_COMMUNITY_React + Vite|React + Vite]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_next.config.mjs|next.config.mjs]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 38 edges
2. `train_logic()` - 23 edges
3. `TrainingResult` - 17 edges
4. `compilerOptions` - 16 edges
5. `_db_connect()` - 15 edges
6. `coerce_numeric()` - 14 edges
7. `fmt()` - 13 edges
8. `VantagePoint — Project Context for Next Agent` - 11 edges
9. `login()` - 10 edges
10. `validate_schema()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `test_ai()` --calls--> `groq_text()`  [INFERRED]
  backend/main.py → backend/ai.py
- `list_users()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py
- `delete_user()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py
- `reactivate_user()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py
- `health()` --calls--> `_db_connect()`  [INFERRED]
  backend/main.py → backend/db.py

## Import Cycles
- None detected.

## Communities (27 total, 5 thin omitted)

### Community 0 - "cn"
Cohesion: 0.09
Nodes (42): AnimatedTabItem, AnimatedTabsList(), AnimatedTabsListProps, InvestmentCalculatorTabProps, MarketData, MarketDynamicsTab(), MarketDynamicsTabProps, ROI_ICONS (+34 more)

### Community 1 - "auth.py"
Cohesion: 0.07
Nodes (41): _check_rate_limit(), _clear_attempts(), _create_token(), _decode_token(), delete_user(), _get_client_ip(), get_current_user(), _get_user_by_email() (+33 more)

### Community 2 - "training.py"
Cohesion: 0.12
Nodes (40): baseline_forecast(), build_price_discovery(), build_roi_heatmap(), compute_arbitrage(), detect_price_outliers(), _drop_list_price(), estimate_sales_velocity(), explain_property() (+32 more)

### Community 3 - "main.py"
Cohesion: 0.10
Nodes (36): AiAdviceRequest, explain_shap_features(), get_groq_client(), groq_json(), groq_text(), MarketIntelligenceRequest, ai.py — Groq/LLM client, prompt helpers, and request models for AI endpoints., Return a shared Groq client, or None if no API key is configured. (+28 more)

### Community 4 - "investment-calculator.tsx"
Cohesion: 0.11
Nodes (24): C, downloadPDF(), ReportDocument(), s, buildProjection(), getDealRating(), InvestmentCalculatorTab(), MetricCardProps (+16 more)

### Community 5 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, axios, class-variance-authority, clsx, framer-motion, lucide-react, next, @radix-ui/react-label (+26 more)

### Community 6 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 7 - "VantagePoint — Project Context for Next Agent"
Cohesion: 0.10
Nodes (19): Auth Flow, Backend, Backend (`backend/.env` for local, HF Secrets for prod), Cloud Deployment, Dashboard Tabs, Environment Variables, File Map — Everything Touched, Frontend (+11 more)

### Community 8 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 9 - "types.ts"
Cohesion: 0.11
Nodes (17): Arbitrage, ArbitrageSignal, DataQuality, DominanceVerification, FeatureEngineering, FeatureImportanceEntry, LeaderboardEntry, LeadLagEntry (+9 more)

### Community 10 - "page.tsx"
Cohesion: 0.15
Nodes (10): App(), AppState, MarketInventoryTab(), LoadingTransition(), LoadingTransitionProps, LoginModal(), LoginModalProps, getAiAdvice() (+2 more)

### Community 11 - "select.tsx"
Cohesion: 0.19
Nodes (12): formatBytes(), Sidebar(), SidebarProps, Select(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton() (+4 more)

### Community 12 - "column-mapper.tsx"
Cohesion: 0.18
Nodes (12): ALL_TARGET_COLS, ColumnMapper(), ColumnMapperProps, confidenceBadge(), ConfirmedMapping, MappingRow(), OPTIONAL_COLS, REQUIRED_COLS (+4 more)

### Community 13 - "api.ts"
Cohesion: 0.22
Nodes (10): api, delay(), getMarketIntelligence(), getTrainingResult(), logout(), MarketSignal, startTraining(), waitForTrainingCompletion() (+2 more)

### Community 14 - "model_store.py"
Cohesion: 0.39
Nodes (7): _disk_path(), get_model_state(), _get_supabase(), model_store.py — In-memory + Supabase Storage model cache.  Priority: memory → S, Persist model state: memory + Supabase Storage (or disk fallback)., Load model state: memory → Supabase Storage → disk., save_model_state()

### Community 16 - "layout.tsx"
Cohesion: 0.40
Nodes (3): dmSans, dmSerif, metadata

### Community 17 - "hero.tsx"
Cohesion: 0.40
Nodes (3): Hero(), HeroProps, PHASES

### Community 19 - "ai-advice-panel.tsx"
Cohesion: 0.67
Nodes (3): AiAdvicePanel(), AiAdvicePanelProps, renderAdvice()

### Community 20 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

## Knowledge Gaps
- **126 isolated node(s):** `User`, `dmSans`, `dmSerif`, `metadata`, `AppState` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_run_and_store()` connect `main.py` to `auth.py`, `training.py`, `model_store.py`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `train_logic()` connect `training.py` to `main.py`, `model_store.py`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `select.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `ai.py — Groq/LLM client, prompt helpers, and request models for AI endpoints.`, `Return a shared Groq client, or None if no API key is configured.`, `Call Groq and return raw text expected to be valid JSON.` to the rest of the system?**
  _156 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.08771929824561403 - nodes in this community are weakly interconnected._
- **Should `auth.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0730804810360777 - nodes in this community are weakly interconnected._
- **Should `training.py` be split into smaller, more focused modules?**
  _Cohesion score 0.11945031712473574 - nodes in this community are weakly interconnected._