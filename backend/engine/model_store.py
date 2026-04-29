"""
model_store.py — In-memory + disk model cache (memory → disk → Postgres fallback).
"""

import os

import joblib

_model_store: dict = {}
_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(_MODELS_DIR, exist_ok=True)


def _model_path(job_id: str) -> str:
    return os.path.join(_MODELS_DIR, f"{job_id}.pkl")


def get_model_state(job_id: str):
    """Return cached model state: checks memory first, then disk."""
    if job_id in _model_store:
        return _model_store[job_id]
    path = _model_path(job_id)
    if os.path.exists(path):
        try:
            state = joblib.load(path)
            _model_store[job_id] = state
            return state
        except Exception:
            return None
    return None


def save_model_state(job_id: str, state: dict):
    """Store model state in memory and persist to disk (best-effort)."""
    _model_store[job_id] = state
    try:
        joblib.dump(state, _model_path(job_id))
    except Exception:
        pass
