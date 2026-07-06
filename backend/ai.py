"""
ai.py — Groq/LLM client, prompt helpers, and request models for AI endpoints.
"""

import os
from typing import Optional

from pydantic import BaseModel

# ─── Groq Client ───────────────────────────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# Overridable so a Groq model deprecation is an env change, not a redeploy.
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_groq_client = None


def get_groq_client():
    """Return a shared Groq client, or None if no API key is configured."""
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


def groq_json(prompt: str) -> str:
    """Call Groq and return raw text expected to be valid JSON."""
    client = get_groq_client()
    if not client:
        raise RuntimeError("GROQ_API_KEY not configured.")
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content.strip()


def groq_text(prompt: str) -> str:
    """Call Groq and return plain text."""
    client = get_groq_client()
    if not client:
        raise RuntimeError("GROQ_API_KEY not configured.")
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )
    return response.choices[0].message.content.strip()


def explain_shap_features(shap_features: list[dict]) -> str:
    """Turn top SHAP features into a plain-English paragraph for a home buyer."""
    if not shap_features:
        return "No feature data available to explain this valuation."

    lines = []
    for f in shap_features[:3]:
        name = f.get("feature", "Unknown")
        val  = f.get("value", 0)
        sign = "+" if val >= 0 else ""
        lines.append(f"  - {name}: {sign}${val:,.0f} impact on price")

    prompt = f"""You are a friendly real estate advisor explaining an AI price prediction to a home buyer.
The AI analysed this property and identified the top 3 factors driving its price:

{chr(10).join(lines)}

Write a single, clear paragraph (2-4 sentences) in plain English that:
1. Explains which factors are pushing the price up and which are pulling it down
2. Uses natural language a non-expert can understand (no jargon)
3. Ends with one practical takeaway for the buyer

Do not use bullet points. Do not repeat the raw numbers — translate them into meaning."""

    return groq_text(prompt)


# ─── Request Models ────────────────────────────────────────────────────────────

class AiAdviceRequest(BaseModel):
    total_rows:             int
    locations:              list
    property_types:         list
    avg_price:              float
    min_price:              float
    max_price:              float
    winner_model:           str
    mape:                   float
    r2:                     float
    market_cycle:           str
    yoy_appreciation:       float
    liquidity_score:        float
    expected_days_to_sell:  Optional[float]
    buy_signals_count:      int
    risk_signals_count:     int
    mean_delta_pct:         float
    confidence_level:       str


class MarketIntelligenceRequest(BaseModel):
    market_cycle:           str
    yoy_appreciation:       float
    liquidity_score:        float
    avg_price:              float
    locations:              list
    property_types:         list
    total_rows:             int
    expected_days_to_sell:  Optional[float]
    mape:                   float
    r2:                     float
