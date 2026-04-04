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
from numbers import Real
from engine import train_logic, get_model_state

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

    validation_errors = []

    parsed_dates = pd.to_datetime(df["Date_Listed"], errors="coerce")
    date_ratio = float(parsed_dates.notna().mean()) if len(parsed_dates) else 0.0
    if date_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Date_Listed must be a valid date column")

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

    condition_numeric = pd.to_numeric(df["Condition_Score"], errors="coerce")
    condition_ratio = float(((condition_numeric.notna()) & (condition_numeric >= 1) & (condition_numeric <= 10)).mean()) if len(condition_numeric) else 0.0
    if condition_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("Condition_Score must be numeric between 1 and 10")

    list_price_numeric = pd.to_numeric(df["List_Price"], errors="coerce")
    list_price_ratio = float(((list_price_numeric.notna()) & (list_price_numeric > 0)).mean()) if len(list_price_numeric) else 0.0
    if list_price_ratio < SCHEMA_VALID_RATIO:
        validation_errors.append("List_Price must be numeric and positive")

    close_price_numeric = pd.to_numeric(df["Closing_Price"], errors="coerce")
    close_price_ratio = float(((close_price_numeric.notna()) & (close_price_numeric > 0)).mean()) if len(close_price_numeric) else 0.0
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
    horizon: int = Form(180)
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