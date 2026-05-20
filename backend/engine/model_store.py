"""
model_store.py — In-memory + Supabase Storage model cache.

Priority: memory → Supabase Storage bucket ("models")
Falls back to disk if Supabase is not configured (local dev without bucket).
"""

import io
import os

import joblib

# ── In-memory cache ────────────────────────────────────────────────────────────
_model_store: dict = {}

# ── Supabase client (optional — only initialised if env vars present) ──────────
_supabase = None

def _get_supabase():
    global _supabase
    if _supabase is not None:
        return _supabase
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _supabase = create_client(url, key)
        return _supabase
    except Exception as e:
        print(f"[model_store] Supabase init failed: {e}")
        return None

_BUCKET = "models"

# ── Disk fallback (local dev) ──────────────────────────────────────────────────
_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(_MODELS_DIR, exist_ok=True)

def _disk_path(job_id: str) -> str:
    return os.path.join(_MODELS_DIR, f"{job_id}.pkl")


# ── Public API ────────────────────────────────────────────────────────────────

def save_model_state(job_id: str, state: dict):
    """Persist model state: memory + Supabase Storage (or disk fallback)."""
    _model_store[job_id] = state

    buf = io.BytesIO()
    joblib.dump(state, buf)
    buf.seek(0)
    data = buf.read()

    sb = _get_supabase()
    if sb:
        try:
            path = f"{job_id}.pkl"
            # upsert — remove old version first (ignore error if not exists)
            try:
                sb.storage.from_(_BUCKET).remove([path])
            except Exception:
                pass
            sb.storage.from_(_BUCKET).upload(
                path,
                data,
                {"content-type": "application/octet-stream"},
            )
            return
        except Exception as e:
            print(f"[model_store] Supabase upload failed, falling back to disk: {e}")

    # Disk fallback
    try:
        with open(_disk_path(job_id), "wb") as f:
            f.write(data)
    except Exception as e:
        print(f"[model_store] Disk save failed: {e}")


def get_model_state(job_id: str):
    """Load model state: memory → Supabase Storage → disk."""
    if job_id in _model_store:
        return _model_store[job_id]

    sb = _get_supabase()
    if sb:
        try:
            data = sb.storage.from_(_BUCKET).download(f"{job_id}.pkl")
            state = joblib.load(io.BytesIO(data))
            _model_store[job_id] = state
            return state
        except Exception as e:
            print(f"[model_store] Supabase download failed: {e}")

    # Disk fallback
    path = _disk_path(job_id)
    if os.path.exists(path):
        try:
            state = joblib.load(path)
            _model_store[job_id] = state
            return state
        except Exception:
            pass

    return None
