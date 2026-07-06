# VantagePoint — Project Context for Next Agent

## What This App Does

VantagePoint is an AI-powered real estate analytics platform (university thesis project). Users upload a CSV of property data, the backend trains ML models on it, and the dashboard surfaces insights.

**Full user flow:**
1. Land on homepage → scroll-driven canvas animation plays
2. Click "Launch App" → glassmorphism login modal appears over the animation
3. Log in → loading transition → analytics dashboard
4. In the dashboard: upload CSV → AI maps columns → confirm mapping → train models
5. After training: 8 tabs of analytics unlock (see Dashboard Tabs below)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI (Python), uvicorn |
| Database | Supabase (PostgreSQL via psycopg2) |
| ML Models | CatBoost, LightGBM, scikit-learn |
| Model Storage | Supabase Storage (bucket: `models`) |
| AI Advice | Groq API (LLM) |
| Auth | JWT (custom, via `auth.py`) |
| Hosting | Vercel (frontend) + HuggingFace Spaces Docker (backend) |

---

## Cloud Deployment

| Service | URL / Location |
|---------|---------------|
| Frontend | https://pro-licente.vercel.app |
| Backend | https://buscaedoardo-vantagepoint-backend.hf.space |
| HF Space | https://huggingface.co/spaces/BuscaEdoardo/vantagepoint-backend |
| Supabase project | eqciosqejvustqjlfsvw |

**HF Space secrets** (all set): `DATABASE_URL`, `GROQ_API_KEY`, `JWT_SECRET`, `ADMIN_DEFAULT_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY`, `FRONTEND_ORIGIN`

**Vercel env var**: `NEXT_PUBLIC_API_URL=https://buscaedoardo-vantagepoint-backend.hf.space`

**To redeploy backend**: push changes to `hf-space-clone/` repo or use:
```bash
git clone https://BuscaEdoardo:<HF_TOKEN>@huggingface.co/spaces/BuscaEdoardo/vantagepoint-backend hf-space-clone
# copy backend files (exclude models/, catboost_info/, .env)
# commit and push
```

**IMPORTANT — Binary files in git**: The HF Space rejects `.pkl`, `.tfevents` files. Never commit `backend/models/` or `backend/catboost_info/` to git.

---

## File Map — Everything Touched

### Backend

| File | What it does | Changes made |
|------|-------------|--------------|
| `backend/main.py` | FastAPI app, all API routes, CORS | CORS updated to accept `*.vercel.app` via `allow_origin_regex`; horizon cap raised from 1825 to 3650 days |
| `backend/db.py` | PostgreSQL connection + init | No changes |
| `backend/auth.py` | JWT login/register/admin routes | No changes |
| `backend/ai.py` | Groq LLM integration for AI advice | No changes |
| `backend/data.py` | CSV/XLSX upload + column mapping | No changes |
| `backend/engine/training.py` | ML training (CatBoost, LightGBM) | Added `properties` array extraction (row-level feature values + actual/predicted prices, up to 1000 rows); added to return dict |
| `backend/engine/model_store.py` | Model persistence | Full rewrite: was in-memory + local disk; now in-memory → Supabase Storage bucket `models` → disk fallback |
| `backend/engine/analytics.py` | Post-training analytics | No changes |
| `backend/engine/market.py` | Market dynamics calculations | No changes |
| `backend/engine/utils.py` | Shared utilities | No changes |
| `backend/requirements.txt` | Python deps | Added `supabase>=2.3.0` |
| `backend/Dockerfile` | Docker build for HF Spaces | Created: python:3.11-slim, exposes port 7860 |
| `backend/README.md` | HF Spaces metadata | Created: YAML frontmatter with `sdk: docker` |
| `backend/.env` | Local env vars | `SUPABASE_URL` fixed (removed `/rest/v1/` suffix); `FRONTEND_ORIGIN` added |
| `backend/.gitignore` | Git ignore rules | `catboost_info/` should be added (currently tracked — causes HF push failures) |

### Frontend

| File | What it does | Changes made |
|------|-------------|--------------|
| `frontend/app/page.tsx` | Root page, app state machine | Added `showLoginModal` state; `handleEnterDashboard` now shows login modal instead of redirecting to `/login`; added `handleLoginSuccess`; removed forced redirect to `/login` on load |
| `frontend/app/login/page.tsx` | Dedicated login page | Still exists but no longer used in normal flow (kept as fallback) |
| `frontend/app/layout.tsx` | Next.js root layout | No changes |
| `frontend/next.config.mjs` | Next.js config | Added dynamic backend URL: `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"` |
| `frontend/components/landing/hero.tsx` | Landing page | Full rewrite: scroll-driven canvas animation with 500vh scroll container, 60 frames from `/poza/`, object-fit cover math, devicePixelRatio-aware canvas (setTransform), 3 text phases, progress bar, scroll hint |
| `frontend/components/landing/login-modal.tsx` | Login modal | Created: glassmorphism popup (backdrop-filter blur 18px, white 82% card, scale+fade animation), ports auth logic from login page, calls `onLoginSuccess` after JWT stored |
| `frontend/components/landing/loading-transition.tsx` | Loading screen between landing and dashboard | Logo uses `brightness-0 invert` for white on dark |
| `frontend/components/dashboard/sidebar.tsx` | Left sidebar | Admin Panel button: was `text-blue-700 bg-blue-50` → fixed to `text-foreground bg-muted` |
| `frontend/components/dashboard/tabs/cash-flow.tsx` | Cash flow tab | Equity column: was `text-blue-600` → fixed to `text-foreground` |
| `frontend/components/dashboard/tabs/price-analysis.tsx` | Price analysis tab | Full design unification: added dark hero banner (Activity icon, MAPE, metrics), all sections converted to `Card border-0 shadow-sm`, tooltip colors fixed |
| `frontend/components/dashboard/tabs/predict-tab.tsx` | Predict tab | Full rewrite: "Select from Dataset" mode (searchable table of all properties from training result), autocompletes form fields on row click, shows Actual vs AI vs Predicted comparison |
| `frontend/src/types.ts` | TypeScript types | Added `PropertyRow` interface; added `properties?: PropertyRow[]` to `TrainingResult` |

### Static Assets

| Path | Contents |
|------|----------|
| `frontend/public/logo-vantagepoint.png` | App logo (used with `brightness-0 invert` for dark backgrounds) |
| `frontend/public/poza/` | **ACTIVE** — 60 frames, `video site_000.jpg` → `video site_059.jpg`, 1920×1080 JPG |
| `frontend/public/frames-png/` | Unused — 101 frames, `ezgif-frame-001.png` → `ezgif-frame-101.png`, 1280×720 PNG |
| `frontend/public/new-poza/` | Unused — 101 frames, `ezgif-frame-001.png` → `ezgif-frame-101.png`, 1920×1080 PNG |

### Root

| File | Notes |
|------|-------|
| `index.html` | Standalone scroll animation prototype (not part of Next.js app, ignore) |

---

## Dashboard Tabs

All tabs are locked until training completes. Training result is stored in `sessionStorage` as `ev-result`.

| Tab | Component | What it shows |
|-----|-----------|---------------|
| Price Discovery | `valuation-engine.tsx` | Main valuation output, feature importance, arbitrage signals |
| Price Analysis | `price-analysis.tsx` | Dark hero banner with MAPE + uplift/drag metrics, price distribution charts |
| Market Intelligence | `market-dynamics.tsx` | YoY appreciation, sales velocity, scenario simulation slider |
| Market Inventory | `market-inventory.tsx` | Property type breakdown, inventory metrics |
| Predict | `predict-tab.tsx` | Select property from CSV dataset OR manual entry → AI prediction with actual vs predicted comparison |
| Investment | `investment-calculator.tsx` | ROI calculator |
| Cash Flow | `cash-flow.tsx` | Cash flow projections, equity growth |
| Model Report | `model-stats.tsx` | Model diagnostics, winner model, R², training/test metrics |

---

## Auth Flow

- JWT token stored in `localStorage` as `ev-token`
- User object stored in `localStorage` as `ev-user`
- On app load: if token exists + `ev-result` in sessionStorage → go straight to dashboard
- If no token → stay on landing; clicking "Launch App" opens login modal
- If token exists → clicking "Launch App" goes straight to loading transition
- Admin route: `/admin` page exists separately

---

## Known Issues / Pending Work

### Must Fix
- **`backend/catboost_info/` tracked in git** — these binary training artifacts (`events.out.tfevents`) cause HF Spaces push to fail. Run `git rm -r --cached backend/catboost_info/` and add `catboost_info/` to root `.gitignore`, then commit.
- **Supabase DATABASE_URL may be stale** — if local backend fails with `ENOTFOUND tenant/user`, get fresh connection string from Supabase → Settings → Database → Transaction pooler (port 6543, host `aws-0-eu-central-1.pooler.supabase.com`). Update both `backend/.env` and HF Space secret.

### Nice to Have
- Mobile responsive design — dashboard is desktop-only; not a priority for thesis demo
- The `/login` page still exists but is bypassed — could be deleted
- `frontend/public/frames-png/` and `frontend/public/new-poza/` are unused dead weight (~200MB total) — delete them to reduce Vercel bundle size

---

## Environment Variables

### Backend (`backend/.env` for local, HF Secrets for prod)
```
GROQ_API_KEY=...
DATABASE_URL=postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
JWT_SECRET=...
ADMIN_DEFAULT_PASSWORD=admin123
FRONTEND_ORIGIN=https://pro-licente.vercel.app
SUPABASE_URL=https://eqciosqejvustqjlfsvw.supabase.co
SUPABASE_KEY=...  (anon/publishable key works for storage reads/writes)
```

### Frontend (`.env.local` for local, Vercel env vars for prod)
```
NEXT_PUBLIC_API_URL=https://buscaedoardo-vantagepoint-backend.hf.space
```
Locally this can be omitted — defaults to `http://localhost:8000`.

---

## How to Run Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## Scroll Animation — Current State

- **Component**: `frontend/components/landing/hero.tsx`
- **Frame source**: `/poza/` — files named `video site_000.jpg` to `video site_059.jpg`
- **Frame count**: 60
- **Resolution**: 1920×1080
- **Scroll container**: 500vh tall
- **Canvas**: sticky to viewport, uses `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` for Retina sharpness
- **Phases**:
  - Frames 0–17: "See the market clearly"
  - Frames 18–39: "Know the value before you buy"
  - Frames 40–59: "Your edge starts here" + CTA button
- **To change frames**: update `FRAME_COUNT`, `FRAME_PATH`, and the 3 `end:` values in `PHASES` in `hero.tsx`; copy new images to `frontend/public/<folder>/`
