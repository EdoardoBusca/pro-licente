"""
db.py — Postgres connection, table initialisation, job results CRUD, model persistence.
"""

import io
import json
import math
import os
from numbers import Real

import joblib
import psycopg2
import psycopg2.extras


def _db_connect():
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return psycopg2.connect(db_url, connect_timeout=8)


# In-memory fallback so job status survives a DB connection blip.
_job_cache: dict[str, dict] = {}


# ─── Table Setup ───────────────────────────────────────────────────────────────

def init_results_db():
    """Create training_results and model_store tables if they don't exist."""
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


# ─── Job Results ───────────────────────────────────────────────────────────────

def _sanitize_for_json(value):
    """Recursively replace NaN/Infinity with None so json.dumps never raises."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, Real):
        v = float(value)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if isinstance(value, dict):
        return {k: _sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_for_json(v) for v in value]
    return value


def set_job_result(job_id: str, status: str, data=None, error: str | None = None):
    safe = _sanitize_for_json(data) if data is not None else None
    # Always update the in-memory cache first
    _job_cache[job_id] = {"status": status, "data": safe, "error": error}
    payload = json.dumps(safe) if safe is not None else None
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO training_results (job_id, status, data, error)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT(job_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    data   = EXCLUDED.data,
                    error  = EXCLUDED.error
                """,
                (job_id, status, payload, error),
            )
        conn.commit()


def get_job_result(job_id: str):
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, data, error FROM training_results WHERE job_id = %s",
                    (job_id,),
                )
                row = cur.fetchone()

        if row:
            status, data, error = row
            response = {"status": status}
            if data:
                response["data"] = _sanitize_for_json(json.loads(data))
            if error:
                response["error"] = error
            return response
    except Exception:
        pass

    # DB unreachable — fall back to in-memory cache
    cached = _job_cache.get(job_id)
    if not cached:
        return {"status": "not_found"}
    response = {"status": cached["status"]}
    if cached["data"] is not None:
        response["data"] = cached["data"]
    if cached["error"]:
        response["error"] = cached["error"]
    return response


# ─── Model Persistence ─────────────────────────────────────────────────────────

def save_model_to_db(job_id: str, state: dict):
    """Serialize model state with joblib and store in Postgres (best-effort)."""
    try:
        buf = io.BytesIO()
        joblib.dump(state, buf)
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO model_store (job_id, model_data)
                    VALUES (%s, %s)
                    ON CONFLICT (job_id) DO UPDATE
                        SET model_data = EXCLUDED.model_data, created_at = NOW()
                    """,
                    (job_id, psycopg2.Binary(buf.getvalue())),
                )
            conn.commit()
    except Exception:
        pass


def load_model_from_db(job_id: str):
    """Load model state from Postgres. Returns None if not found."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT model_data FROM model_store WHERE job_id = %s", (job_id,)
                )
                row = cur.fetchone()
        if not row:
            return None
        return joblib.load(io.BytesIO(bytes(row[0])))
    except Exception:
        return None
