# Graph Report - pro-licente  (2026-07-04)

## Corpus Check
- 55 files · ~18,000,334 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 441 nodes · 831 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `24731a3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_cn|cn]]
- [[_COMMUNITY_training.py|training.py]]
- [[_COMMUNITY_auth.py|auth.py]]
- [[_COMMUNITY_main.py|main.py]]
- [[_COMMUNITY_investment-calculator.tsx|investment-calculator.tsx]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_VantagePoint — Project Context for Next Agent|VantagePoint — Project Context for Next Agent]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_components.json|components.json]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_select.tsx|select.tsx]]
- [[_COMMUNITY_column-mapper.tsx|column-mapper.tsx]]
- [[_COMMUNITY_api.ts|api.ts]]
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
3. `TrainingResult` - 19 edges
4. `compilerOptions` - 16 edges
5. `_db_connect()` - 15 edges
6. `fmt()` - 15 edges
7. `coerce_numeric()` - 14 edges
8. `VantagePoint — Project Context for Next Agent` - 11 edges
9. `login()` - 10 edges
10. `validate_schema()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `health()` --calls--> `_db_connect()`  [INFERRED]
  backend/main.py → backend/db.py
- `test_ai()` --calls--> `groq_text()`  [INFERRED]
  backend/main.py → backend/ai.py
- `list_users()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py
- `delete_user()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py
- `reactivate_user()` --calls--> `_db_connect()`  [INFERRED]
  backend/auth.py → backend/db.py

## Import Cycles
- None detected.

## Communities (26 total, 5 thin omitted)

### Community 0 - "cn"
Cohesion: 0.08
Nodes (43): AnimatedTabItem, AnimatedTabsList(), AnimatedTabsListProps, CashFlowTabProps, ProjectionRow, InvestmentCalculatorTabProps, MarketData, MarketDynamicsTab() (+35 more)

### Community 1 - "training.py"
Cohesion: 0.10
Nodes (47): baseline_forecast(), build_price_discovery(), build_roi_heatmap(), compute_arbitrage(), detect_price_outliers(), _drop_list_price(), estimate_sales_velocity(), explain_property() (+39 more)

### Community 2 - "auth.py"
Cohesion: 0.08
Nodes (39): _check_rate_limit(), _clear_attempts(), _create_token(), _decode_token(), delete_user(), _get_client_ip(), get_current_user(), _get_user_by_email() (+31 more)

### Community 3 - "main.py"
Cohesion: 0.09
Nodes (38): AiAdviceRequest, explain_shap_features(), get_groq_client(), groq_json(), groq_text(), MarketIntelligenceRequest, ai.py — Groq/LLM client, prompt helpers, and request models for AI endpoints., Return a shared Groq client, or None if no API key is configured. (+30 more)

### Community 4 - "investment-calculator.tsx"
Cohesion: 0.11
Nodes (25): C, downloadPDF(), ReportDocument(), s, buildProjection(), CashFlowTab(), DealRating, getDealRating() (+17 more)

### Community 5 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, axios, class-variance-authority, clsx, framer-motion, lucide-react, next, @radix-ui/react-label (+26 more)

### Community 6 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 7 - "VantagePoint — Project Context for Next Agent"
Cohesion: 0.10
Nodes (19): Auth Flow, Backend, Backend (`backend/.env` for local, HF Secrets for prod), Cloud Deployment, Dashboard Tabs, Environment Variables, File Map — Everything Touched, Frontend (+11 more)

### Community 8 - "types.ts"
Cohesion: 0.11
Nodes (18): Arbitrage, ArbitrageSignal, DataQuality, DominanceVerification, FeatureEngineering, FeatureImportanceEntry, LeaderboardEntry, LeadLagEntry (+10 more)

### Community 9 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 10 - "page.tsx"
Cohesion: 0.16
Nodes (9): App(), AppState, MarketInventoryTab(), PredictTab(), LoadingTransition(), LoadingTransitionProps, LoginModal(), LoginModalProps (+1 more)

### Community 11 - "select.tsx"
Cohesion: 0.19
Nodes (12): formatBytes(), Sidebar(), SidebarProps, Select(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton() (+4 more)

### Community 12 - "column-mapper.tsx"
Cohesion: 0.18
Nodes (12): ALL_TARGET_COLS, ColumnMapper(), ColumnMapperProps, confidenceBadge(), ConfirmedMapping, MappingRow(), OPTIONAL_COLS, REQUIRED_COLS (+4 more)

### Community 13 - "api.ts"
Cohesion: 0.20
Nodes (11): api, delay(), getAiAdvice(), getTrainingResult(), logout(), mapColumns(), predictSingle(), startTraining() (+3 more)

### Community 15 - "layout.tsx"
Cohesion: 0.40
Nodes (3): dmSans, dmSerif, metadata

### Community 16 - "hero.tsx"
Cohesion: 0.40
Nodes (3): Hero(), HeroProps, PHASES

### Community 18 - "ai-advice-panel.tsx"
Cohesion: 0.67
Nodes (3): AiAdvicePanel(), AiAdvicePanelProps, renderAdvice()

### Community 19 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

## Knowledge Gaps
- **127 isolated node(s):** `User`, `dmSans`, `dmSerif`, `metadata`, `AppState` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_run_and_store()` connect `main.py` to `training.py`, `auth.py`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `train_logic()` connect `training.py` to `main.py`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `select.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `ai.py — Groq/LLM client, prompt helpers, and request models for AI endpoints.`, `Return a shared Groq client, or None if no API key is configured.`, `Call Groq and return raw text expected to be valid JSON.` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.08306010928961749 - nodes in this community are weakly interconnected._
- **Should `training.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09579100145137881 - nodes in this community are weakly interconnected._
- **Should `auth.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07777777777777778 - nodes in this community are weakly interconnected._