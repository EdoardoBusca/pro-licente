"""
main.py — Estate Vantage FastAPI Backend

Entry point. Wires together all modules and exposes the API routes.

Module layout:
  db.py      — Postgres connection, job results, model persistence
  auth.py    — Rate limiting, JWT, user management, /auth/* routes
  ai.py      — Groq/LLM client and AI endpoint request models
  data.py    — File parsing, column mapping, schema validation
  engine/    — ML training pipeline and analytics
    training.py   — train_logic(): full ML pipeline
    analytics.py  — SHAP, ROI heatmap, arbitrage, sales velocity
    market.py     — YoY appreciation, market cycle, lead-lag
    model_store.py — in-memory + disk model cache
    utils.py      — number parsing, column helpers
"""

import json
import os
import re
import uuid

from dotenv import load_dotenv

# Load .env before any local imports so env vars are available at module level
load_dotenv()

import pandas as pd
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional

from ai import (
    AiAdviceRequest, MarketIntelligenceRequest,
    GROQ_API_KEY, get_groq_client, groq_json, groq_text,
)
from auth import get_current_user, init_users_db, router as auth_router
from data import ALLOWED_FILE_TYPES, apply_column_mapping, read_uploaded_file, validate_schema
from db import (
    get_job_result, init_results_db, load_model_from_db,
    save_model_to_db, set_job_result,
)
from engine import get_model_state, train_logic

# ─── App Setup ─────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

# ─── Startup ───────────────────────────────────────────────────────────────────

init_results_db()
init_users_db()

# ─── Pydantic Models ───────────────────────────────────────────────────────────

class ScenarioSimulationRequest(BaseModel):
    base_valuation:          float = Field(..., gt=0, lt=1_000_000_000)
    slider_value:            float = Field(..., ge=0, le=100)
    market_cycle:            Optional[str] = Field(None, max_length=50)
    renovation_package:      str   = Field("basic", pattern=r"^(basic|midrange|luxury|structural)$")
    forecast_horizon_months: int   = Field(12, ge=1, le=240)


class ScenarioSimulationResponse(BaseModel):
    adjustedValuation:  float
    conditionImpact:    str
    renovationCost:     float
    expectedValueGain:  float
    projectedProfit:    float


class PredictRequest(BaseModel):
    sq_ft_total:     float          = Field(..., gt=0, lt=100_000)
    bedrooms:        Optional[float] = Field(None, ge=0, le=100)
    bathrooms:       Optional[float] = Field(None, ge=0, le=50)
    condition_score: Optional[float] = Field(None, ge=1, le=10)
    zip_code:        Optional[str]   = Field(None, max_length=20, pattern=r"^[\w\s\-]+$")
    property_type:   Optional[str]   = Field(None, max_length=50, pattern=r"^[\w\s\-]+$")


# ─── Training ──────────────────────────────────────────────────────────────────

_ALLOWED_TARGETS = {"Closing_Price"}


@app.post("/train")
async def start_training(
    background_tasks: BackgroundTasks,
    file:             UploadFile = File(...),
    target:           str        = Form(...),
    horizon:          int        = Form(180),
    column_mapping:   Optional[str] = Form(None),
    _user:            dict       = Depends(get_current_user),
):
    if target.strip() not in _ALLOWED_TARGETS:
        return JSONResponse(status_code=400, content={"status": "failed", "error": f"Invalid target. Allowed: {_ALLOWED_TARGETS}"})
    if not (1 <= horizon <= 1825):
        return JSONResponse(status_code=400, content={"status": "failed", "error": "Horizon must be 1–1825 days."})
    if file.filename:
        ext = os.path.splitext(file.filename.lower())[1]
        if ext not in ALLOWED_FILE_TYPES:
            return JSONResponse(status_code=400, content={"status": "failed", "error": f"Unsupported file type '{ext}'."})
    if column_mapping and len(column_mapping) > 50_000:
        return JSONResponse(status_code=400, content={"status": "failed", "error": "column_mapping payload too large."})

    job_id = str(uuid.uuid4())
    try:
        try:
            set_job_result(job_id, "processing")
        except Exception:
            pass  # DB write is best-effort; training proceeds regardless

        contents = await file.read()
        max_bytes = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
        if len(contents) > max_bytes:
            mb = len(contents) / 1024 / 1024
            set_job_result(job_id, "failed", error=f"File too large ({mb:.1f} MB).")
            return {"job_id": job_id, "status": "failed", "error": f"File too large ({mb:.1f} MB)"}
        if not contents:
            set_job_result(job_id, "failed", error="Uploaded file is empty.")
            return {"job_id": job_id, "status": "failed"}

        df = read_uploaded_file(contents, file.filename)
        df.columns = df.columns.str.strip()

        if df.empty:
            msg = "File was read but contains no data rows."
            set_job_result(job_id, "failed", error=msg)
            return {"job_id": job_id, "status": "failed", "error": msg}

        if column_mapping:
            try:
                df = apply_column_mapping(df, json.loads(column_mapping))
            except Exception as e:
                return {"job_id": job_id, "status": "failed", "error": f"Column mapping error: {e}"}

        validate_schema(df, target.strip())

        # Auto-scale horizon when data spans multiple years
        date_col = next((c for c in df.columns if "date" in c.lower()), None)
        if date_col:
            try:
                dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
                if len(dates) >= 2:
                    span = (dates.max() - dates.min()).days
                    if span > 365 and horizon == 180:
                        horizon = min(730, int(span / 5))
            except Exception:
                pass

        background_tasks.add_task(_run_and_store, job_id, df, target.strip(), horizon)
        return {"job_id": job_id, "message": "Training started", "status": "processing"}

    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"status": "failed", "error": str(exc.detail)})
    except Exception as exc:
        try:
            set_job_result(job_id, "failed", error=str(exc))
        except Exception:
            pass
        return {"job_id": job_id, "status": "failed", "error": str(exc)}


def _run_and_store(job_id: str, df: pd.DataFrame, target: str, horizon: int):
    try:
        result = train_logic(df, target, horizon, job_id=job_id)
        set_job_result(job_id, "completed", data=result)
        state = get_model_state(job_id)
        if state:
            save_model_to_db(job_id, state)
    except Exception as e:
        set_job_result(job_id, "failed", error=str(e))


@app.get("/results/{job_id}")
async def get_results(job_id: str, _user: dict = Depends(get_current_user)):
    try:
        return get_job_result(job_id)
    except Exception as exc:
        return {"status": "failed", "error": f"Could not fetch result: {exc}"}


# ─── Single-Property Prediction ────────────────────────────────────────────────

@app.post("/predict/{job_id}")
async def predict_single(job_id: str, payload: PredictRequest, _user: dict = Depends(get_current_user)):
    state = get_model_state(job_id) or load_model_from_db(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Model not found. Please re-train.")

    model    = state["model"]
    scaler   = state["scaler"]
    features = state["features"]

    row = {f: 0.0 for f in features}
    numeric_map = {
        "sq_ft_total":   payload.sq_ft_total,
        "bedrooms":      payload.bedrooms,
        "bathrooms":     payload.bathrooms,
        "condition_score": payload.condition_score,
    }
    for col in features:
        col_lower = col.lower()
        for key, val in numeric_map.items():
            if key in col_lower and val is not None:
                row[col] = float(val)

    if payload.zip_code and f"Zip_Code_{payload.zip_code}" in row:
        row[f"Zip_Code_{payload.zip_code}"] = 1.0
    if payload.property_type and f"Property_Type_{payload.property_type}" in row:
        row[f"Property_Type_{payload.property_type}"] = 1.0

    X_input  = pd.DataFrame([row], columns=features)
    X_scaled = scaler.transform(X_input)
    prediction = float(model.predict(X_scaled)[0])

    debug_inputs = {col: row[col] for col in features
                   if not any(col.startswith(p) for p in ("Zip_Code_", "Property_Type_"))}
    return {"predicted_price": round(prediction, 2), "debug_inputs": debug_inputs}


# ─── Market Scenario Simulation ────────────────────────────────────────────────

@app.post("/simulate-scenario", response_model=ScenarioSimulationResponse)
async def simulate_scenario(payload: ScenarioSimulationRequest, _user: dict = Depends(get_current_user)):
    normalized = (payload.slider_value - 50.0) / 50.0
    cycle      = (payload.market_cycle or "").lower()
    package    = (payload.renovation_package or "basic").lower()
    months     = int(payload.forecast_horizon_months or 12)

    cycle_mult = 1.15 if ("hot" in cycle or "seller" in cycle) else (0.9 if ("cold" in cycle or "buyer" in cycle) else 1.0)

    packages = {
        "basic":      {"label": "Basic Refresh",            "cost": 18_000.0,  "gain_pct": 0.05},
        "midrange":   {"label": "Mid-Range Modernization",  "cost": 42_000.0,  "gain_pct": 0.09},
        "luxury":     {"label": "Luxury Upgrade",           "cost": 95_000.0,  "gain_pct": 0.11},
        "structural": {"label": "Structural Rehab",         "cost": 140_000.0, "gain_pct": 0.07},
    }
    selected     = packages.get(package, packages["basic"])
    reno_cost    = float(selected["cost"])
    value_gain   = float(payload.base_valuation * selected["gain_pct"])
    profit       = float(value_gain - reno_cost)

    horizon_factor = min(1.8, 1.0 + months / 120.0)
    pct_shift      = normalized * 0.14 * cycle_mult * horizon_factor
    adjusted       = max(0.0, payload.base_valuation * (1.0 + pct_shift) + profit)

    direction    = "upside" if pct_shift >= 0 else "downside"
    profitability = "profitable" if profit >= 0 else "unprofitable"

    return ScenarioSimulationResponse(
        adjustedValuation = float(adjusted),
        conditionImpact   = (
            f"Scenario indicates {direction} pressure of {abs(pct_shift) * 100:.1f}% "
            f"over a {months}-month horizon. {selected['label']} package is {profitability} "
            f"with net impact {profit:,.0f} USD."
        ),
        renovationCost    = reno_cost,
        expectedValueGain = value_gain,
        projectedProfit   = profit,
    )


# ─── AI Column Mapping ─────────────────────────────────────────────────────────

@app.post("/map-columns")
async def map_columns(file: UploadFile = File(...), _user: dict = Depends(get_current_user)):
    if file.filename:
        ext = os.path.splitext(file.filename.lower())[1]
        if ext not in ALLOWED_FILE_TYPES:
            return JSONResponse(status_code=400, content={"error": f"Unsupported file type '{ext}'."})

    try:
        contents  = await file.read()
        max_bytes = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
        if len(contents) > max_bytes:
            return JSONResponse(status_code=413, content={"error": "File too large."})

        df = read_uploaded_file(contents, file.filename)
        df.columns = df.columns.str.strip()
        all_columns = list(df.columns)

        # If Groq is unavailable, return columns so the user can map manually
        if not get_groq_client():
            return {
                "mappings": {},
                "needs_user_input": [],
                "all_columns": all_columns,
                "summary": "AI unavailable — please map your columns manually below.",
            }

        samples = {col: df[col].dropna().astype(str).head(3).tolist() for col in df.columns}
        sample_text = "\n".join(
            f'  "{col}": [{", ".join(repr(v) for v in vals)}]'
            for col, vals in samples.items()
        )

        prompt = f"""You are a real estate data schema expert. Map the given CSV columns to the required schema.

REQUIRED SCHEMA:
- Date_Listed: listing date (any parseable date format)
- Property_Type: type of property (Apartment, House, Condo, Villa, etc.)
- Sq_Ft_Total: total area IN SQUARE FEET (numeric — convert if in m²/sqm/sqyd/acres)
- Zip_Code: location identifier (zip code, area name, neighbourhood, postal code)
- Condition_Score: property condition 1–10 (derive from furnishing/quality text if no direct match)
- List_Price: the ASKING price — what the seller originally listed the property for.
- Closing_Price: the FINAL TRANSACTION price — what the buyer actually paid. CRITICAL: List_Price and Closing_Price must NEVER map to the same source column unless there is genuinely only one price column.
- Bedrooms: number of bedrooms (optional)
- Bathrooms: number of bathrooms (optional)

CSV COLUMNS WITH SAMPLE VALUES:
{sample_text}

Rules:
1. List_Price vs Closing_Price — most important distinction. Assign asking price to List_Price, sold price to Closing_Price.
2. Use human reasoning — "sqft Price" is price-per-sqft NOT area.
3. If a column is not found, set "source" to null and confidence to 0.0
4. Confidence < 0.70 = unsure — add to "needs_user_input"
5. Only use transform "use_as_closing" when there is genuinely no separate closing/sale price column.

Respond ONLY with valid JSON (no markdown fences):
{{
  "mappings": {{
    "Date_Listed":     {{"source": "col_or_null", "confidence": 0.95, "transform": null,          "reason": "brief"}},
    "Property_Type":   {{"source": "col_or_null", "confidence": 0.90, "transform": null,          "reason": "brief"}},
    "Sq_Ft_Total":     {{"source": "col_or_null", "confidence": 0.85, "transform": "sqm_to_sqft", "reason": "brief"}},
    "Zip_Code":        {{"source": "col_or_null", "confidence": 0.80, "transform": null,          "reason": "brief"}},
    "Condition_Score": {{"source": "col_or_null", "confidence": 0.70, "transform": null,          "reason": "brief"}},
    "List_Price":      {{"source": "col_or_null", "confidence": 0.95, "transform": null,          "reason": "brief"}},
    "Closing_Price":   {{"source": "col_or_null", "confidence": 0.60, "transform": null,          "reason": "brief"}},
    "Bedrooms":        {{"source": "col_or_null", "confidence": 0.90, "transform": null,          "reason": "brief"}},
    "Bathrooms":       {{"source": "col_or_null", "confidence": 0.90, "transform": null,          "reason": "brief"}}
  }},
  "needs_user_input": [],
  "summary": "one sentence dataset description"
}}

Supported transforms: null, "sqm_to_sqft", "sqft_to_sqm", "sqyd_to_sqft", "derive_condition_from_furnishing", "use_as_closing"
"""
        raw    = groq_json(prompt)
        raw    = re.sub(r"^```(?:json)?\s*", "", raw)
        raw    = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        result["all_columns"] = all_columns
        return result

    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"AI returned invalid JSON: {e}"})
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── AI Investment Advice ──────────────────────────────────────────────────────

@app.post("/ai-advice")
async def ai_advice(payload: AiAdviceRequest, _user: dict = Depends(get_current_user)):
    if not get_groq_client():
        return JSONResponse(status_code=503, content={"error": "GROQ_API_KEY not configured."})
    try:
        locs     = ", ".join(str(l) for l in payload.locations[:8])     or "N/A"
        types    = ", ".join(str(t) for t in payload.property_types[:6]) or "N/A"
        days_str = f"{payload.expected_days_to_sell:.0f} days" if payload.expected_days_to_sell else "unknown"

        prompt = f"""You are a senior real estate investment advisor. Analyze these ML results and give sharp, specific advice.

DATASET ANALYTICS:
- Properties analysed: {payload.total_rows:,}
- Locations: {locs}
- Property types: {types}
- Price range: {payload.min_price:,.0f} – {payload.max_price:,.0f} (avg: {payload.avg_price:,.0f})
- Best model: {payload.winner_model} | Accuracy: ±{payload.mape:.1f}% error | R² = {payload.r2:.3f}
- Model confidence: {payload.confidence_level}
- Market cycle: {payload.market_cycle}
- YoY price appreciation: {payload.yoy_appreciation:.1f}%
- Liquidity score: {payload.liquidity_score:.0f}/99 | Avg time to sell: {days_str}
- Undervalued properties (buy signals): {payload.buy_signals_count}
- Overvalued properties (risk signals): {payload.risk_signals_count}
- Avg AI vs listed price delta: {payload.mean_delta_pct:.1f}%

Write exactly 4 investment insights. Each must:
1. Reference specific numbers from the data above
2. Give one clear, actionable recommendation
3. Flag any associated risk if relevant

Format: Use headers like "## 1. [Title]" for each insight. Keep total under 380 words. Be direct — no filler phrases."""

        return {"advice": groq_text(prompt)}
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── AI Market Intelligence ────────────────────────────────────────────────────

@app.post("/market-intelligence")
async def market_intelligence(payload: MarketIntelligenceRequest, _user: dict = Depends(get_current_user)):
    if not get_groq_client():
        return JSONResponse(status_code=503, content={"error": "GROQ_API_KEY not configured."})
    try:
        locs     = ", ".join(str(l) for l in payload.locations[:6])      or "N/A"
        types    = ", ".join(str(t) for t in payload.property_types[:4]) or "N/A"
        days_str = f"{payload.expected_days_to_sell:.0f}" if payload.expected_days_to_sell else "unknown"

        prompt = f"""You are a quantitative real estate analyst. Based on the dataset statistics below, identify exactly 3 lead-lag market signals — economic or behavioural factors that precede price movements.

DATASET:
- Locations: {locs}
- Property types: {types}
- Avg price: {payload.avg_price:,.0f}
- Market cycle: {payload.market_cycle}
- YoY appreciation: {payload.yoy_appreciation:.1f}%
- Liquidity score: {payload.liquidity_score:.0f}/99
- Avg days to sell: {days_str}
- ML model error: ±{payload.mape:.1f}% | R² = {payload.r2:.3f}
- Properties analysed: {payload.total_rows:,}

For each signal provide:
- name: short signal name (e.g. "Interest Rate Sensitivity")
- lag_days: estimated days this factor leads the market (integer, 14–180)
- correlation: estimated correlation with price movement (float, 0.50–0.95)
- description: one sentence using specific numbers from the data above

Respond ONLY with valid JSON (no markdown):
{{"signals": [{{"name": "...", "lag_days": 60, "correlation": 0.78, "description": "..."}}, {{"name": "...", "lag_days": 45, "correlation": 0.71, "description": "..."}}, {{"name": "...", "lag_days": 120, "correlation": 0.65, "description": "..."}}]}}"""

        raw    = groq_json(prompt)
        raw    = re.sub(r"^```(?:json)?\s*", "", raw)
        raw    = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)

    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"AI returned invalid JSON: {e}"})
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Health & Debug ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    from db import _db_connect
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status":   "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "groq":     "configured" if GROQ_API_KEY else "missing",
    }


@app.get("/test-ai")
async def test_ai(_user: dict = Depends(get_current_user)):
    if not GROQ_API_KEY:
        return {"status": "error", "message": "GROQ_API_KEY is empty — check backend/.env"}
    try:
        return {"status": "ok", "response": groq_text("Reply with exactly: OK"), "key_prefix": GROQ_API_KEY[:8] + "..."}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"status": "error", "message": str(e)}
