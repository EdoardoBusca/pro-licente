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

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator, EmailStr
from typing import Optional
import pandas as pd
import io
import uuid
import json
import os
import math
import re
import time
import threading
from collections import defaultdict
from numbers import Real
from datetime import datetime, timedelta
from engine import train_logic, get_model_state
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

# ─── Rate Limiter ──────────────────────────────────────────────────────────────
# In-memory store: { ip: [(timestamp, ...), ...] }
# 5 failed attempts per 15-minute window per IP.
_RATE_LIMIT_MAX     = int(os.getenv("RATE_LIMIT_MAX", "5"))
_RATE_LIMIT_WINDOW  = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "900"))  # 15 min
_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = threading.Lock()

def _get_client_ip(request: Request) -> str:
    """Return real IP, respecting X-Forwarded-For for reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _check_rate_limit(ip: str):
    """Raise 429 if this IP has exceeded the login attempt limit."""
    now = time.time()
    cutoff = now - _RATE_LIMIT_WINDOW
    with _rate_lock:
        # Evict old entries
        _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
        if len(_rate_store[ip]) >= _RATE_LIMIT_MAX:
            retry_after = int(_RATE_LIMIT_WINDOW - (now - _rate_store[ip][0]))
            raise HTTPException(
                status_code=429,
                detail=f"Too many attempts. Try again in {retry_after // 60} min {retry_after % 60} sec.",
                headers={"Retry-After": str(retry_after)},
            )

def _record_failed_attempt(ip: str):
    now = time.time()
    with _rate_lock:
        _rate_store[ip].append(now)

def _clear_attempts(ip: str):
    with _rate_lock:
        _rate_store.pop(ip, None)

# ─── Auth Configuration ────────────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. Add it to backend/.env")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

_bearer = HTTPBearer(auto_error=False)

def _hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def _verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def _create_token(user_id: int, email: str, role: str) -> str:
    from jose import jwt
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _decode_token(token: str) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return {}

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    """FastAPI dependency — validates JWT and returns the payload dict."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = _decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

# ─── User DB Helpers ───────────────────────────────────────────────────────────

def init_users_db():
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id              SERIAL PRIMARY KEY,
                    email           TEXT   UNIQUE NOT NULL,
                    name            TEXT   NOT NULL,
                    hashed_password TEXT   NOT NULL,
                    role            TEXT   NOT NULL DEFAULT 'analyst',
                    created_at      TEXT   NOT NULL,
                    is_active       INTEGER NOT NULL DEFAULT 1
                )
            """)
        conn.commit()
    _seed_admin()

def _seed_admin():
    """Create a default admin account on first run if no users exist."""
    default_pw = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            count = cur.fetchone()[0]
            if count == 0:
                cur.execute(
                    "INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (%s,%s,%s,%s,%s)",
                    ("admin@estatevantage.com", "Admin", _hash_password(default_pw),
                     "admin", datetime.utcnow().isoformat())
                )
        conn.commit()

def _get_user_by_email(email: str):
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, hashed_password, role, is_active FROM users WHERE email = %s",
                (email.lower().strip(),)
            )
            row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "name": row[2],
            "hashed_password": row[3], "role": row[4], "is_active": row[5]}

# ─── Groq Setup ────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_groq_client = None

def _get_client():
    """Return a shared Groq client, or None if no API key."""
    global _groq_client
    if not GROQ_API_KEY:
        return None
    if _groq_client is None:
        try:
            from groq import Groq
            _groq_client = Groq(api_key=GROQ_API_KEY)
        except Exception:
            return None
    return _groq_client

# Keep for backwards compat with map-columns endpoint
def _get_gemini(): return _get_client()


def _gemini_json(prompt: str) -> str:
    """Call Groq and return raw text (expected to be JSON)."""
    client = _get_client()
    if not client:
        raise RuntimeError("GROQ_API_KEY not configured.")
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content.strip()


def _gemini_text(prompt: str) -> str:
    """Call Groq and return plain text."""
    client = _get_client()
    if not client:
        raise RuntimeError("GROQ_API_KEY not configured.")
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )
    return response.choices[0].message.content.strip()


def explain_shap_features(shap_features: list[dict]) -> str:
    """
    Turn top SHAP features into a human-friendly paragraph for a home buyer.

    shap_features: list of dicts with keys 'feature' and 'value' (dollar impact).
    Example: [{"feature": "Location", "value": 50000},
              {"feature": "Year Built", "value": -10000},
              {"feature": "Sq Ft Total", "value": 25000}]

    Returns a plain-English explanation string.
    """
    if not shap_features:
        return "No feature data available to explain this valuation."

    lines = []
    for f in shap_features[:3]:
        name  = f.get("feature", "Unknown")
        val   = f.get("value", 0)
        sign  = "+" if val >= 0 else ""
        lines.append(f"  - {name}: {sign}${val:,.0f} impact on price")
    features_text = "\n".join(lines)

    prompt = f"""You are a friendly real estate advisor explaining an AI price prediction to a home buyer.
The AI analysed this property and identified the top 3 factors driving its price:

{features_text}

Write a single, clear paragraph (2-4 sentences) in plain English that:
1. Explains which factors are pushing the price up and which are pulling it down
2. Uses natural language a non-expert can understand (no jargon)
3. Ends with one practical takeaway for the buyer

Do not use bullet points. Do not repeat the raw numbers — translate them into meaning."""

    return _gemini_text(prompt)

app = FastAPI()


class ScenarioSimulationRequest(BaseModel):
    base_valuation: float = Field(..., gt=0, lt=1_000_000_000)
    slider_value: float = Field(..., ge=0, le=100)
    market_cycle: Optional[str] = Field(None, max_length=50)
    renovation_package: str = Field("basic", pattern=r"^(basic|midrange|luxury|structural)$")
    forecast_horizon_months: int = Field(12, ge=1, le=240)


class ScenarioSimulationResponse(BaseModel):
    adjustedValuation: float
    conditionImpact: str
    renovationCost: float
    expectedValueGain: float
    projectedProfit: float

# ─── Configuration ─────────────────────────────────────────────────────────────
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
    """Open a Postgres connection using DATABASE_URL from environment."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return psycopg2.connect(db_url)


def init_results_db():
    """Create all application tables if they do not already exist."""
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS training_results (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    data   TEXT,
                    error  TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS model_store (
                    job_id     TEXT PRIMARY KEY,
                    model_data BYTEA NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
        conn.commit()


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

    # Fill missing numeric columns with best-effort defaults so training can proceed.
    # The user confirmed they want to run — we don't block on data quality thresholds.
    sqft_numeric = pd.to_numeric(df["Sq_Ft_Total"], errors="coerce")
    if sqft_numeric.isna().all():
        df["Sq_Ft_Total"] = 1000.0
    else:
        df["Sq_Ft_Total"] = sqft_numeric.fillna(sqft_numeric.median())

    list_price_numeric = pd.to_numeric(df["List_Price"], errors="coerce")
    if list_price_numeric.isna().all():
        df["List_Price"] = 0.0
    else:
        df["List_Price"] = list_price_numeric.fillna(list_price_numeric.median())

    close_price_final = pd.to_numeric(df["Closing_Price"], errors="coerce")
    if close_price_final.isna().all():
        df["Closing_Price"] = df["List_Price"]
    else:
        df["Closing_Price"] = close_price_final.fillna(df["List_Price"])


def set_job_result(job_id: str, status: str, data=None, error: Optional[str] = None):
    safe_data = _sanitize_for_json(data) if data is not None else None
    payload = json.dumps(safe_data) if safe_data is not None else None
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO training_results (job_id, status, data, error)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT(job_id) DO UPDATE SET
                    status=EXCLUDED.status,
                    data=EXCLUDED.data,
                    error=EXCLUDED.error
                """,
                (job_id, status, payload, error)
            )
        conn.commit()


def get_job_result(job_id: str):
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, data, error FROM training_results WHERE job_id = %s",
                (job_id,)
            )
            row = cur.fetchone()

    if not row:
        return {"status": "not_found"}

    status, data, error = row
    response = {"status": status}
    if data:
        response["data"] = _sanitize_for_json(json.loads(data))
    if error:
        response["error"] = error
    return response


# ─── Model Persistence (Postgres) ─────────────────────────────────────────────

def save_model_to_db(job_id: str, state: dict):
    """Serialize model state and store in Postgres."""
    try:
        import joblib, io
        buf = io.BytesIO()
        joblib.dump(state, buf)
        data = buf.getvalue()
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO model_store (job_id, model_data)
                    VALUES (%s, %s)
                    ON CONFLICT (job_id) DO UPDATE SET model_data = EXCLUDED.model_data, created_at = NOW()
                    """,
                    (job_id, psycopg2.Binary(data))
                )
            conn.commit()
    except Exception:
        pass  # best-effort

def load_model_from_db(job_id: str):
    """Load model state from Postgres. Returns None if not found."""
    try:
        import joblib, io
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT model_data FROM model_store WHERE job_id = %s", (job_id,))
                row = cur.fetchone()
        if not row:
            return None
        return joblib.load(io.BytesIO(bytes(row[0])))
    except Exception:
        return None

# ─── Startup ───────────────────────────────────────────────────────────────────
init_results_db()
init_users_db()

# ─── CORS ──────────────────────────────────────────────────────────────────────
_frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth Endpoints ────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")
_SAFE_NAME_RE = re.compile(r"^[\w\s\-'.]{1,80}$")

class LoginRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v

class RegisterRequest(BaseModel):
    email: str = Field(..., max_length=320)
    name: str  = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)
    role: str  = Field("analyst", pattern=r"^(analyst|admin)$")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not _SAFE_NAME_RE.match(v):
            raise ValueError("Name contains invalid characters")
        return v

class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)

@app.post("/auth/login")
async def login(payload: LoginRequest, request: Request):
    ip = _get_client_ip(request)
    _check_rate_limit(ip)

    user = _get_user_by_email(payload.email)
    if not user or not user["is_active"] or not _verify_password(payload.password, user["hashed_password"]):
        _record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _clear_attempts(ip)
    token = _create_token(user["id"], user["email"], user["role"])
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}

@app.post("/auth/register")
async def register(payload: RegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (%s,%s,%s,%s,%s)",
                    (payload.email, payload.name,
                     _hash_password(payload.password), payload.role, datetime.utcnow().isoformat())
                )
            conn.commit()
        return {"message": "User created successfully"}
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Email already registered")

@app.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["sub"], "email": current_user["email"], "role": current_user["role"]}

@app.get("/auth/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, name, role, created_at, is_active FROM users ORDER BY created_at DESC")
            rows = cur.fetchall()
    return [{"id": r[0], "email": r[1], "name": r[2], "role": r[3],
             "created_at": r[4], "is_active": bool(r[5])} for r in rows]

@app.delete("/auth/users/{user_id}")
async def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if str(user_id) == current_user.get("sub"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_active = 0 WHERE id = %s", (user_id,))
        conn.commit()
    return {"message": "User deactivated"}

@app.patch("/auth/users/{user_id}/reactivate")
async def reactivate_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_active = 1 WHERE id = %s", (user_id,))
        conn.commit()
    return {"message": "User reactivated"}

@app.patch("/auth/users/{user_id}/password")
async def reset_password(user_id: int, payload: ResetPasswordRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET hashed_password = %s WHERE id = %s",
                        (_hash_password(payload.new_password), user_id))
        conn.commit()
    return {"message": "Password updated"}

# ─── Endpoints ─────────────────────────────────────────────────────────────────

_ALLOWED_TARGETS = {"Closing_Price"}
_ALLOWED_FILE_TYPES = {".csv", ".xlsx", ".xls", ".txt"}

@app.post("/train")
async def start_training(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target: str = Form(...),
    horizon: int = Form(180),
    column_mapping: Optional[str] = Form(None),
    _user: dict = Depends(get_current_user),
):
    # Input validation on form fields
    if target.strip() not in _ALLOWED_TARGETS:
        return JSONResponse(status_code=400, content={"status": "failed", "error": f"Invalid target column. Allowed: {_ALLOWED_TARGETS}"})
    if not (1 <= horizon <= 1825):
        return JSONResponse(status_code=400, content={"status": "failed", "error": "Horizon must be between 1 and 1825 days."})
    if file.filename:
        ext = os.path.splitext(file.filename.lower())[1]
        if ext not in _ALLOWED_FILE_TYPES:
            return JSONResponse(status_code=400, content={"status": "failed", "error": f"Unsupported file type '{ext}'. Allowed: {', '.join(_ALLOWED_FILE_TYPES)}"})
    if column_mapping and len(column_mapping) > 50_000:
        return JSONResponse(status_code=400, content={"status": "failed", "error": "column_mapping payload too large."})

    try:
        job_id = str(uuid.uuid4())
        set_job_result(job_id, "processing")

        contents = await file.read()
        MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
        if len(contents) > MAX_UPLOAD_BYTES:
            mb = len(contents) / 1024 / 1024
            set_job_result(job_id, "failed", error=f"File too large ({mb:.1f} MB). Maximum is {MAX_UPLOAD_BYTES // 1024 // 1024} MB.")
            return {"job_id": job_id, "status": "failed", "error": f"File too large ({mb:.1f} MB)"}
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
        # Persist model to Postgres so it survives server restarts/redeploys
        from engine import get_model_state
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
        # Return structured failure so frontend can show a useful message instead of HTTP 500.
        return {"status": "failed", "error": f"Could not fetch result: {exc}"}


@app.post("/simulate-scenario", response_model=ScenarioSimulationResponse)
async def simulate_scenario(payload: ScenarioSimulationRequest, _user: dict = Depends(get_current_user)):
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
    sq_ft_total: float    = Field(..., gt=0, lt=100_000)
    bedrooms: Optional[float]       = Field(None, ge=0, le=100)
    bathrooms: Optional[float]      = Field(None, ge=0, le=50)
    condition_score: Optional[float] = Field(None, ge=1, le=10)
    zip_code: Optional[str]         = Field(None, max_length=20, pattern=r"^[\w\s\-]+$")
    property_type: Optional[str]    = Field(None, max_length=50, pattern=r"^[\w\s\-]+$")


@app.post("/predict/{job_id}")
async def predict_single(job_id: str, payload: PredictRequest, _user: dict = Depends(get_current_user)):
    state = get_model_state(job_id)
    if state is None:
        # Disk miss — try loading from Postgres (survives redeploys)
        state = load_model_from_db(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Model not found. Please re-train.")

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


# ─── Gemini Health Check ───────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check for cloud platforms (no auth required)."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "groq": "configured" if GROQ_API_KEY else "missing",
    }


@app.get("/test-ai")
async def test_ai(_user: dict = Depends(get_current_user)):
    """Quick endpoint to verify Groq is reachable. Visit http://localhost:8000/test-ai in browser."""
    if not GROQ_API_KEY:
        return {"status": "error", "message": "GROQ_API_KEY is empty — check backend/.env"}
    try:
        result = _gemini_text("Reply with exactly: OK")
        return {"status": "ok", "response": result, "key_prefix": GROQ_API_KEY[:8] + "..."}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"status": "error", "message": str(e)}


# ─── AI Column Mapping ─────────────────────────────────────────────────────────

@app.post("/map-columns")
async def map_columns(file: UploadFile = File(...), _user: dict = Depends(get_current_user)):
    """Use Groq to intelligently map arbitrary CSV columns to the required schema."""
    if file.filename:
        ext = os.path.splitext(file.filename.lower())[1]
        if ext not in _ALLOWED_FILE_TYPES:
            return JSONResponse(status_code=400, content={"error": f"Unsupported file type '{ext}'."})
    gemini = _get_gemini()
    if not gemini:
        return JSONResponse(
            status_code=503,
            content={"error": "GROQ_API_KEY not configured. Add GROQ_API_KEY to backend/.env"},
        )
    try:
        contents = await file.read()
        MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
        if len(contents) > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"error": f"File too large. Maximum is {MAX_UPLOAD_BYTES // 1024 // 1024} MB."})
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
- List_Price: the ASKING / LISTING price — what the seller originally listed the property for. Keywords: "list price", "asking price", "listed at", "original price", "MLS price".
- Closing_Price: the FINAL TRANSACTION price — what the buyer actually paid when the deal closed. Keywords: "sale price", "sold price", "closing price", "final price", "transaction price", "sold for". CRITICAL: List_Price and Closing_Price must NEVER map to the same source column unless there is genuinely only one price column in the entire dataset.
- Bedrooms: number of bedrooms (optional)
- Bathrooms: number of bathrooms (optional)

CSV COLUMNS WITH SAMPLE VALUES:
{sample_text}

Rules:
1. List_Price vs Closing_Price — this is the most important distinction. If you see two price columns (e.g. "Price" and "Sale_Price", or "Listed_Price" and "Sold_Price"), assign the asking/listed one to List_Price and the sold/final one to Closing_Price. Only use the same source for both if there is truly only one price column.
2. Use human reasoning — "sqft Price" is price-per-sqft NOT area, "Covered Area" is area, "bedroom" maps to Bedrooms, etc.
3. If a column is not found, set "source" to null and confidence to 0.0
4. Confidence < 0.70 means you are unsure — add it to "needs_user_input"
5. For unit conversion, pick the correct transform.
6. Only use transform "use_as_closing" when there is genuinely no separate closing/sale price column.

Respond ONLY with valid JSON (no markdown fences):
{{
  "mappings": {{
    "Date_Listed":     {{"source": "col_or_null", "confidence": 0.95, "transform": null,           "reason": "brief"}},
    "Property_Type":   {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}},
    "Sq_Ft_Total":     {{"source": "col_or_null", "confidence": 0.85, "transform": "sqm_to_sqft",  "reason": "brief"}},
    "Zip_Code":        {{"source": "col_or_null", "confidence": 0.80, "transform": null,           "reason": "brief"}},
    "Condition_Score": {{"source": "col_or_null", "confidence": 0.70, "transform": null,           "reason": "brief"}},
    "List_Price":      {{"source": "col_or_null", "confidence": 0.95, "transform": null,           "reason": "brief"}},
    "Closing_Price":   {{"source": "col_or_null", "confidence": 0.60, "transform": null,           "reason": "brief"}},
    "Bedrooms":        {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}},
    "Bathrooms":       {{"source": "col_or_null", "confidence": 0.90, "transform": null,           "reason": "brief"}}
  }},
  "needs_user_input": [],
  "summary": "one sentence dataset description and notable conversions"
}}

Supported transforms: null, "sqm_to_sqft", "sqft_to_sqm", "sqyd_to_sqft", "derive_condition_from_furnishing", "use_as_closing"
"""
        raw = _gemini_json(prompt)
        # Strip markdown fences if model ignores mime_type instruction
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        result["all_columns"] = list(df.columns)
        return result
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"Gemini returned invalid JSON: {e}"})
    except Exception as e:
        import traceback; traceback.print_exc()
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
async def ai_advice(payload: AiAdviceRequest, _user: dict = Depends(get_current_user)):
    """Generate custom investment advice from Gemini based on training results."""
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

        if not _get_client():
            return JSONResponse(status_code=503, content={"error": "GROQ_API_KEY not configured."})
        return {"advice": _gemini_text(prompt)}
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── AI Market Intelligence ────────────────────────────────────────────────────

class MarketIntelligenceRequest(BaseModel):
    market_cycle: str
    yoy_appreciation: float
    liquidity_score: float
    avg_price: float
    locations: list
    property_types: list
    total_rows: int
    expected_days_to_sell: Optional[float]
    mape: float
    r2: float


@app.post("/market-intelligence")
async def market_intelligence(payload: MarketIntelligenceRequest, _user: dict = Depends(get_current_user)):
    """Generate Lead-Lag Market Intelligence signals using Groq."""
    if not _get_client():
        return JSONResponse(status_code=503, content={"error": "GROQ_API_KEY not configured."})
    try:
        locs = ", ".join(str(l) for l in payload.locations[:6]) or "N/A"
        types = ", ".join(str(t) for t in payload.property_types[:4]) or "N/A"
        days_str = f"{payload.expected_days_to_sell:.0f}" if payload.expected_days_to_sell else "unknown"

        prompt = f"""You are a quantitative real estate analyst. Based on the dataset statistics below, identify exactly 3 lead-lag market signals — economic or behavioural factors that precede price movements in this market.

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
- name: short signal name (e.g. "Interest Rate Sensitivity", "Inventory Absorption Rate")
- lag_days: estimated days this factor leads the market (integer, 14–180)
- correlation: estimated correlation with price movement (float, 0.50–0.95)
- description: one sentence explaining the signal using specific numbers from the data above

Respond ONLY with valid JSON (no markdown):
{{"signals": [{{"name": "...", "lag_days": 60, "correlation": 0.78, "description": "..."}}, {{"name": "...", "lag_days": 45, "correlation": 0.71, "description": "..."}}, {{"name": "...", "lag_days": 120, "correlation": 0.65, "description": "..."}}]}}"""

        raw = _gemini_json(prompt)
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)
        return result
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"AI returned invalid JSON: {e}"})
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})