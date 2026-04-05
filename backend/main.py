"""
main.py — Estate Vantage FastAPI Backend

Exposes two HTTP endpoints:
  POST /train           — accepts a CSV/Excel file, validates the real-estate schema,
                          and kicks off a background ML training job (CatBoost / XGBoost /
                          LightGBM / RandomForest). Returns a job_id immediately.
  GET  /results/{job_id} — polls the SQLite database for the training job's status
                           and returns the full result payload once complete.

Architecture:
  • Training runs in a FastAPI BackgroundTask so the HTTP response is instant.
  • Results are persisted in a local SQLite file (results.db) using WAL mode to
    allow concurrent reads while a write is in progress.
  • All floating-point values are sanitised before JSON serialisation to replace
    NaN/Infinity with None (JSON has no concept of these values).
"""

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
import pandas as pd
import io
import uuid
import sqlite3
import json
import os
import math
import re
from numbers import Real
from engine import train_logic, get_model_state
from dotenv import load_dotenv

load_dotenv()

# ─── Gemini Setup ──────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
_gemini_model = None

def _get_gemini():
    global _gemini_model
    if not GEMINI_API_KEY:
        return None
    if _gemini_model is None:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            _gemini_model = genai.GenerativeModel(
                "gemini-1.5-flash",
                generation_config={"temperature": 0.1, "response_mime_type": "application/json"},
            )
        except Exception:
            return None
    return _gemini_model

app = FastAPI()


class ScenarioSimulationRequest(BaseModel):
    base_valuation: float = Field(..., gt=0)
    slider_value: float = Field(..., ge=0, le=100)
    market_cycle: Optional[str] = None
    renovation_package: str = "basic"
    forecast_horizon_months: int = Field(12, ge=1, le=240)


class ScenarioSimulationResponse(BaseModel):
    adjustedValuation: float
    conditionImpact: str
    renovationCost: float
    expectedValueGain: float
    projectedProfit: float

# ─── Configuration ─────────────────────────────────────────────────────────────
DB_PATH = "results.db"

# Minimum fraction of rows that must satisfy each column validation rule.
# Defaults to 90 % — override with the SCHEMA_VALID_RATIO environment variable.
SCHEMA_VALID_RATIO = float(os.getenv("SCHEMA_VALID_RATIO", "0.90"))

# Every uploaded file must contain exactly these columns (case-sensitive after strip).
MANDATORY_REAL_ESTATE_COLUMNS = [
    "Date_Listed",
    "Property_Type",
    "Sq_Ft_Total",
    "Zip_Code",
    "Condition_Score",
    "List_Price",
    "Closing_Price",
]


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _sanitize_for_json(value):
    """Recursively replace NaN/Infinity with None so json.dumps never raises."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, Real):
        numeric_value = float(value)
        if math.isnan(numeric_value) or math.isinf(numeric_value):
            return None
        return numeric_value
    if isinstance(value, dict):
        return {k: _sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_for_json(v) for v in value]
    return value


def _db_connect():
    """Open a WAL-mode SQLite connection.
    WAL (Write-Ahead Logging) lets the frontend poll GET /results while the
    background training task is writing, preventing "database is locked" errors.
    timeout=30 gives writes extra time to complete under load.
    """
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_results_db():
    """Create the training_results table if it does not already exist.
    Called once at startup — safe to call on every restart.
    """
    with _db_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS training_results (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,  -- "processing" | "completed" | "failed"
                data   TEXT,           -- JSON-serialised result payload (nullable)
                error  TEXT            -- Error message string (nullable)
            )
            """
        )


def _read_uploaded_table(contents: bytes, filename: str):
    file_ext = os.path.splitext((filename or "").lower())[1]

    csv_attempts = [
        {"sep": None, "engine": "python", "encoding_errors": "replace"},
        {"sep": ",", "engine": "python", "encoding_errors": "replace"},
        {"sep": ";", "engine": "python", "encoding_errors": "replace"},
        {"sep": "\t", "engine": "python", "encoding_errors": "replace"},
        {"sep": "|", "engine": "python", "encoding_errors": "replace"},
    ]

    csv_errors = []
    should_try_csv_first = file_ext in {".csv", ".txt", ""}

    if should_try_csv_first:
        for kwargs in csv_attempts:
            try:
                df = pd.read_csv(io.BytesIO(contents), **kwargs)
                if df is not None and len(df.columns) > 0:
                    return df
            except Exception as exc:
                csv_errors.append(str(exc))

    try:
        return pd.read_excel(io.BytesIO(contents))
    except Exception as excel_exc:
        if not should_try_csv_first:
            for kwargs in csv_attempts:
                try:
                    df = pd.read_csv(io.BytesIO(contents), **kwargs)
                    if df is not None and len(df.columns) > 0:
                        return df
                except Exception as exc:
                    csv_errors.append(str(exc))

        error_bits = []
        if csv_errors:
            error_bits.append(f"CSV parsing failed ({csv_errors[-1]})")
        error_bits.append(f"Excel parsing failed ({excel_exc})")
        error_text = "; ".join(error_bits)
        raise ValueError(f"Could not read uploaded file. {error_text}")


def _apply_column_mapping(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """Rename columns and apply unit/currency transforms from AI-generated mapping."""
    NUMERIC_TRANSFORMS = {
        "sqm_to_sqft":  lambda x: x * 10.764,
        "sqft_to_sqm":  lambda x: x / 10.764,
        "sqyd_to_sqft": lambda x: x * 9.0,
        # legacy keys kept so old mappings still work
        "acres_to_sqft":      lambda x: x * 43560.0,
        "inr_to_usd":         lambda x: x / 83.0,
        "lakh_to_usd":        lambda x: x * 1200.0,
        "crore_to_usd":       lambda x: x * 120000.0,
        "thousands_to_units": lambda x: x * 1000.0,
    }
    FURNISH_SCORE = {
        "furnished": 9, "fully furnished": 9,
        "semi-furnished": 7, "semi furnished": 7, "semifurnished": 7,
        "unfurnished": 5, "bare shell": 4,
    }
    result = df.copy()
    for target_col, info in mapping.items():
        source = (info or {}).get("source")
        transform = (info or {}).get("transform")
        if not source or source not in df.columns:
            continue
        raw = df[source]
        if transform in NUMERIC_TRANSFORMS:
            result[target_col] = pd.to_numeric(raw, errors="coerce").apply(NUMERIC_TRANSFORMS[transform])
        elif transform == "derive_condition_from_furnishing":
            result[target_col] = (
                raw.astype(str).str.lower().str.strip()
                .map(lambda v: FURNISH_SCORE.get(v, 6))
            )
        else:
            # null, "use_as_closing", or any unknown transform — just copy/rename
            result[target_col] = raw
    return result


def _validate_real_estate_schema(df: pd.DataFrame, target: str):
    missing = [column for column in MANDATORY_REAL_ESTATE_COLUMNS if column not in df.columns]
    if missing:
        missing_text = ", ".join(missing)
        raise ValueError(
            f"Data Schema Mismatch: Missing mandatory columns: {missing_text}. "
            f"Expected schema: {', '.join(MANDATORY_REAL_ESTATE_COLUMNS)}."
        )

    if str(target).strip().lower() != "closing_price":
        raise ValueError(
            "Data Schema Mismatch: Target Variable must be 'Closing_Price' for Real Estate Sales mode."
        )

    # ── Auto-fix Date_Listed ───────────────────────────────────────────────────
    # Many international datasets have non-standard or missing date values
    # (e.g. "Dec '25", "Ready to Move", "NA"). Rather than failing, we
    # generate synthetic listing dates spread uniformly over the past 3 years.
    parsed_dates = pd.to_datetime(df["Date_Listed"], errors="coerce")
    date_ratio = float(parsed_dates.notna().mean()) if len(parsed_dates) else 0.0
    if date_ratio < SCHEMA_VALID_RATIO:
        import random as _random
        from datetime import datetime as _dt, timedelta as _td
        _base = _dt(2022, 1, 1)
        _span = (_dt.today() - _base).days
        _rng  = _random.Random(42)
        df["Date_Listed"] = [
            (_base + _td(days=_rng.randint(0, _span))).strftime("%Y-%m-%d")
            for _ in range(len(df))
        ]

    # ── Auto-fix Closing_Price from List_Price ────────────────────────────────
    close_price_numeric = pd.to_numeric(df["Closing_Price"], errors="coerce")
    close_ratio = float(((close_price_numeric.notna()) & (close_price_numeric > 0)).mean()) if len(close_price_numeric) else 0.0
    if close_ratio < SCHEMA_VALID_RATIO:
        import random as _random
        _rng2 = _random.Random(0)
        list_prices = pd.to_numeric(df["List_Price"], errors="coerce")
        df["Closing_Price"] = list_prices.apply(
            lambda p: round(p * _rng2.uniform(0.94, 0.99), -3) if pd.notna(p) and p > 0 else None
        )

    # ── Auto-fix Condition_Score ──────────────────────────────────────────────
    # If values are outside 1–10 but are large numbers (e.g. ratings out of 100),
    # rescale. If completely missing, default to 6.
    cond_numeric = pd.to_numeric(df["Condition_Score"], errors="coerce")
    valid_cond = ((cond_numeric.notna()) & (cond_numeric >= 1) & (cond_numeric <= 10))
    if float(valid_cond.mean()) < SCHEMA_VALID_RATIO:
        # Try rescaling from 0–100 to 1–10
        rescaled = (cond_numeric / 10.0).clip(1, 10)
        still_valid = ((rescaled.notna()) & (rescaled >= 1) & (rescaled <= 10))
        if float(still_valid.mean()) >= SCHEMA_VALID_RATIO:
            df["Condition_Score"] = rescaled.round(1)
        else:
            df["Condition_Score"] = cond_numeric.fillna(6).clip(1, 10)

    validation_errors = []

    property_type_ratio = float(df["Property_Type"].astype(str).str.strip().ne("").mean()) if len(df) else 0.0
    if property_type_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Property_Type must be non-empty categorical values")

    zip_ratio = float(df["Zip_Code"].astype(str).str.strip().ne("").mean()) if len(df) else 0.0
    if zip_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Zip_Code must be non-empty categorical values")

    sqft_numeric = pd.to_numeric(df["Sq_Ft_Total"], errors="coerce")
    sqft_ratio = float(((sqft_numeric.notna()) & (sqft_numeric > 0)).mean()) if len(sqft_numeric) else 0.0
    if sqft_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Sq_Ft_Total must be numeric and positive")

    list_price_numeric = pd.to_numeric(df["List_Price"], errors="coerce")
    list_price_ratio = float(((list_price_numeric.notna()) & (list_price_numeric > 0)).mean()) if len(list_price_numeric) else 0.0
    if list_price_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("List_Price must be numeric and positive")

    close_price_final = pd.to_numeric(df["Closing_Price"], errors="coerce")
    close_price_ratio = float(((close_price_final.notna()) & (close_price_final > 0)).mean()) if len(close_price_final) else 0.0
    if close_price_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Closing_Price must be numeric and positive")

    if validation_errors:
        raise ValueError(
            f"Data Schema Mismatch: {'; '.join(validation_errors)}. "
            f"At least {SCHEMA_VALID_RATIO * 100:.0f}% of rows must satisfy each required field."
        )


def set_job_result(job_id: str, status: str, data=None, error: Optional[str] = None):
    safe_data = _sanitize_for_json(data) if data is not None else None
    payload = json.dumps(safe_data) if safe_data is not None else None
    with _db_connect() as conn:
        conn.execute(
            """
            INSERT INTO training_results (job_id, status, data, error)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                status=excluded.status,
                data=excluded.data,
                error=excluded.error
            """,
            (job_id, status, payload, error)
        )


def get_job_result(job_id: str):
    with _db_connect() as conn:
        row = conn.execute(
            "SELECT status, data, error FROM training_results WHERE job_id = ?",
            (job_id,)
        ).fetchone()

    if not row:
        return {"status": "not_found"}

    status, data, error = row
    response = {"status": status}
    if data:
        response["data"] = _sanitize_for_json(json.loads(data))
    if error:
        response["error"] = error
    return response


# ─── Startup ───────────────────────────────────────────────────────────────────
init_results_db()

# ─── CORS ──────────────────────────────────────────────────────────────────────
_frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/train")
async def start_training(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target: str = Form(...),
    horizon: int = Form(180),
    column_mapping: Optional[str] = Form(None),
):
    try:
        job_id = str(uuid.uuid4())
        set_job_result(job_id, "processing")

        contents = await file.read()
        if not contents:
            set_job_result(job_id, "failed", error="Uploaded file is empty.")
            return {"job_id": job_id, "message": "Training failed", "status": "failed"}

        df = _read_uploaded_table(contents, file.filename)
        df.columns = df.columns.str.strip()

        if df.empty:
            message = "Uploaded file was read successfully but contains no data rows."
            set_job_result(job_id, "failed", error=message)
            return {"job_id": job_id, "message": "Training failed", "status": "failed", "error": message}

        if column_mapping:
            try:
                mapping_dict = json.loads(column_mapping)
                df = _apply_column_mapping(df, mapping_dict)
            except Exception as map_err:
                return {"job_id": job_id, "status": "failed", "error": f"Column mapping error: {map_err}"}

        _validate_real_estate_schema(df, target.strip())
        
        # Intelligent horizon scaling: if data spans years, extend forecast proportionally
        date_col = next((c for c in df.columns if 'date' in c.lower()), None)
        if date_col:
            try:
                df_dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
                if len(df_dates) >= 2:
                    date_span = (df_dates.max() - df_dates.min()).days
                    # Scale horizon: e.g., 3 years of history -> 365 day forecast, 10 years -> 730 days
                    if date_span > 365:
                        auto_horizon = min(730, int(date_span / 5))
                        if horizon == 180:  # User didn't override default
                            horizon = auto_horizon
            except Exception:
                pass

        background_tasks.add_task(run_and_store, job_id, df, target.strip(), horizon)
        return {"job_id": job_id, "message": "Training started in background", "status": "processing"}
    except HTTPException as exc:
        # Keep explicit HTTP errors if raised intentionally.
        return JSONResponse(status_code=exc.status_code, content={"status": "failed", "error": str(exc.detail)})
    except Exception as exc:
        # Never leak raw 500 to UI during training bootstrap.
        try:
            set_job_result(job_id, "failed", error=str(exc))
        except Exception:
            pass
        return {"job_id": locals().get("job_id", "unknown"), "message": "Training failed", "status": "failed", "error": str(exc)}


def run_and_store(job_id, df, target, horizon):
    try:
        result = train_logic(df, target, horizon, job_id=job_id)
        set_job_result(job_id, "completed", data=result)
    except Exception as e:
        set_job_result(job_id, "failed", error=str(e))


@app.get("/results/{job_id}")
async def get_results(job_id: str):
    try:
        return get_job_result(job_id)
    except Exception as exc:
        # Return structured failure so frontend can show a useful message instead of HTTP 500.
        return {"status": "failed", "error": f"Could not fetch result: {exc}"}


@app.post("/simulate-scenario", response_model=ScenarioSimulationResponse)
async def simulate_scenario(payload: ScenarioSimulationRequest):
    """Backend valuation adjustment service for Market Dynamics slider simulation."""
    normalized = (payload.slider_value - 50.0) / 50.0
    cycle = (payload.market_cycle or "").lower()
    renovation_package = (payload.renovation_package or "basic").lower()
    horizon_months = int(payload.forecast_horizon_months or 12)

    # Cycle multiplier gently scales sensitivity by current market regime.
    cycle_multiplier = 1.0
    if "hot" in cycle or "seller" in cycle:
        cycle_multiplier = 1.15
    elif "cold" in cycle or "buyer" in cycle:
        cycle_multiplier = 0.9

    package_table = {
        "basic": {"label": "Basic Refresh", "cost": 18_000.0, "gain_pct": 0.05},
        "midrange": {"label": "Mid-Range Modernization", "cost": 42_000.0, "gain_pct": 0.09},
        "luxury": {"label": "Luxury Upgrade", "cost": 95_000.0, "gain_pct": 0.11},
        "structural": {"label": "Structural Rehab", "cost": 140_000.0, "gain_pct": 0.07},
    }
    selected = package_table.get(renovation_package, package_table["basic"])
    renovation_cost = float(selected["cost"])
    expected_value_gain = float(payload.base_valuation * selected["gain_pct"])
    projected_profit = float(expected_value_gain - renovation_cost)

    # Longer horizons increase uncertainty and widen scenario outcomes.
    horizon_factor = min(1.8, 1.0 + (horizon_months / 120.0))

    max_shift = 0.14 * cycle_multiplier
    pct_shift = normalized * max_shift * horizon_factor
    adjusted = (payload.base_valuation * (1.0 + pct_shift)) + projected_profit
    adjusted = max(0.0, adjusted)

    direction = "upside" if pct_shift >= 0 else "downside"
    profitability = "profitable" if projected_profit >= 0 else "unprofitable"
    condition = (
        f"Scenario indicates {direction} pressure of {abs(pct_shift) * 100:.1f}% "
        f"relative to base valuation over a {horizon_months}-month horizon. "
        f"Selected package is {selected['label']} ({profitability}) with net impact {projected_profit:,.0f} USD."
    )

    return ScenarioSimulationResponse(
        adjustedValuation=float(adjusted),
        conditionImpact=condition,
        renovationCost=renovation_cost,
        expectedValueGain=expected_value_gain,
        projectedProfit=projected_profit,
    )


# ─── Single-property prediction ────────────────────────────────────────────────

class PredictRequest(BaseModel):
    sq_ft_total: float
    bedrooms: Optional[float] = None
    bathrooms: Optional[float] = None
    condition_score: Optional[float] = None
    zip_code: Optional[str] = None
    property_type: Optional[str] = None


@app.post("/predict/{job_id}")
async def predict_single(job_id: str, payload: PredictRequest):
    state = get_model_state(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Model not found. The server may have restarted — please re-train.")

    model    = state["model"]
    scaler   = state["scaler"]
    features = state["features"]

    row = {f: 0.0 for f in features}

    numeric_map = {
        "sq_ft_total":     payload.sq_ft_total,
        "bedrooms":        payload.bedrooms,
        "bathrooms":       payload.bathrooms,
        "condition_score": payload.condition_score,
    }
    for col in features:
        col_lower = col.lower()
        for key, val in numeric_map.items():
            if key in col_lower and val is not None:
                row[col] = float(val)

    if payload.zip_code:
        col = f"Zip_Code_{payload.zip_code}"
        if col in row:
            row[col] = 1.0

    if payload.property_type:
        col = f"Property_Type_{payload.property_type}"
        if col in row:
            row[col] = 1.0

    X_input = pd.DataFrame([row], columns=features)
    X_scaled = scaler.transform(X_input)
    prediction = float(model.predict(X_scaled)[0])
    return {"predicted_price": round(prediction, 2)}


# ─── AI Column Mapping ─────────────────────────────────────────────────────────

@app.post("/map-columns")
async def map_columns(file: UploadFile = File(...)):
    """Use Gemini to intelligently map arbitrary CSV columns to the required schema."""
    gemini = _get_gemini()
    if not gemini:
        return JSONResponse(
            status_code=503,
            content={"error": "Gemini API key not configured. Add GEMINI_API_KEY to backend/.env"},
        )
    try:
        contents = await file.read()
        df = _read_uploaded_table(contents, file.filename)
        df.columns = df.columns.str.strip()

        # Build column samples: name + first 3 non-null values
        samples = {}
        for col in df.columns:
            vals = df[col].dropna().astype(str).head(3).tolist()
            samples[col] = vals

        sample_text = "\n".join(
            f'  "{col}": [{", ".join(repr(v) for v in vals)}]'
            for col, vals in samples.items()
        )

        prompt = f"""You are a real estate data schema expert. Map the given CSV columns to the required schema.

REQUIRED SCHEMA:
- Date_Listed: listing date (any parseable date format)
- Property_Type: type of property (Apartment, House, Condo, Villa, etc.)
- Sq_Ft_Total: total area IN SQUARE FEET (numeric, positive — convert if in m²/sqm/sqyd/acres)
- Zip_Code: location identifier (zip code, area name, neighbourhood, postal code, city district)
- Condition_Score: property condition 1–10 scale (derive from furnishing/quality text if no direct match)
- List_Price: asking/listing price in original currency (numeric, positive)
- Closing_Price: final sale price — use List_Price column if no separate closing price exists
- Bedrooms: number of bedrooms (optional)
- Bathrooms: number of bathrooms (optional)

CSV COLUMNS WITH SAMPLE VALUES:
{sample_text}

Rules:
1. Use human reasoning — "sqft Price" is price-per-sqft NOT area, "Covered Area" is area, "bedroom" maps to Bedrooms, etc.
2. If a column is not found, set "source" to null and confidence to 0.0
3. Confidence < 0.70 means you are unsure — add it to "needs_user_input"
4. For unit conversion, pick the correct transform. For Indian datasets, prices may be in INR or Lakhs.
5. If there's no separate Closing_Price, set transform to "use_as_closing" and use the price column

Respond ONLY with valid JSON (no markdown fences):
{{
  "mappings": {{
    "Date_Listed":     {{"source": "col_or_null", "confidence": 0.95, "transform": null,           "reason": "brief"}},
    "Property_Type":   {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}},
    "Sq_Ft_Total":     {{"source": "col_or_null", "confidence": 0.85, "transform": "sqm_to_sqft",  "reason": "brief"}},
    "Zip_Code":        {{"source": "col_or_null", "confidence": 0.80, "transform": null,           "reason": "brief"}},
    "Condition_Score": {{"source": "col_or_null", "confidence": 0.70, "transform": null,           "reason": "brief"}},
    "List_Price":      {{"source": "col_or_null", "confidence": 0.95, "transform": null,           "reason": "brief"}},
    "Closing_Price":   {{"source": "col_or_null", "confidence": 0.60, "transform": "use_as_closing","reason": "brief"}},
    "Bedrooms":        {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}},
    "Bathrooms":       {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}}
  }},
  "needs_user_input": [],
  "summary": "one sentence dataset description and notable conversions"
}}

Supported transforms: null, "sqm_to_sqft", "sqft_to_sqm", "sqyd_to_sqft", "derive_condition_from_furnishing", "use_as_closing"
"""
        response = gemini.generate_content(prompt)
        raw = response.text.strip()
        # Strip markdown fences if model ignores mime_type instruction
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        result["all_columns"] = list(df.columns)
        return result
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"Gemini returned invalid JSON: {e}"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── AI Investment Advice ──────────────────────────────────────────────────────

class AiAdviceRequest(BaseModel):
    total_rows: int
    locations: list
    property_types: list
    avg_price: float
    min_price: float
    max_price: float
    winner_model: str
    mape: float
    r2: float
    market_cycle: str
    yoy_appreciation: float
    liquidity_score: float
    expected_days_to_sell: Optional[float]
    buy_signals_count: int
    risk_signals_count: int
    mean_delta_pct: float
    confidence_level: str


@app.post("/ai-advice")
async def ai_advice(payload: AiAdviceRequest):
    """Generate custom investment advice from Gemini based on training results."""
    gemini = _get_gemini()
    if not gemini:
        return JSONResponse(
            status_code=503,
            content={"error": "Gemini API key not configured. Add GEMINI_API_KEY to backend/.env"},
        )
    try:
        locs = ", ".join(str(l) for l in payload.locations[:8]) or "N/A"
        types = ", ".join(str(t) for t in payload.property_types[:6]) or "N/A"
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

        import google.generativeai as genai
        advice_model = genai.GenerativeModel(
            "gemini-1.5-flash",
            generation_config={"temperature": 0.4},
        )
        response = advice_model.generate_content(prompt)
        return {"advice": response.text.strip()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})