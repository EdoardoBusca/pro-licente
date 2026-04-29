"""
utils.py — Number parsing, column helpers, and metric utilities.
"""

import re

import numpy as np
import pandas as pd


def canonical_name(name: str) -> str:
    """Lowercase + underscores, used to match column names case-insensitively."""
    return str(name).strip().lower().replace(" ", "_")


def is_id_column(name: str) -> bool:
    n = canonical_name(name)
    if n in {"id", "idx", "index", "row_id", "listing_id", "property_id", "mls_id"}:
        return True
    return n.endswith("_id") or n.startswith("id_") or "index" in n


def find_column(columns, keywords: list[str]):
    """Return the first column whose lowercased name contains any of the keywords."""
    lowered = {str(col).lower().strip(): col for col in columns}
    for key in keywords:
        for lowered_name, original in lowered.items():
            if key in lowered_name:
                return original
    return None


def safe_mape(y_true, y_pred) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    valid = np.isfinite(y_true) & np.isfinite(y_pred) & (np.abs(y_true) > 1.0)
    if not np.any(valid):
        return 0.0
    return float(np.mean(np.abs((y_true[valid] - y_pred[valid]) / np.abs(y_true[valid]))) * 100.0)


# ─── Number Parsing (handles international formats, compact units, currency) ───

def _parse_number_token(value) -> float:
    if pd.isna(value):
        return np.nan

    s = str(value).strip()
    if not s:
        return np.nan

    s = s.replace(' ', ' ').replace(' ', ' ')
    s = re.sub(r"\s+", "", s)
    s = s.replace("'", "")

    sign = 1
    if s.startswith('(') and s.endswith(')'):
        sign, s = -1, s[1:-1]
    if s.startswith('+'):
        s = s[1:]
    elif s.startswith('-'):
        sign, s = sign * -1, s[1:]

    multiplier = 1.0
    m = re.search(r"([kmb])$", s.lower())
    if m:
        multiplier = {"k": 1_000.0, "m": 1_000_000.0, "b": 1_000_000_000.0}[m.group(1)]
        s = s[:-1]

    s = re.sub(r"[^\d,\.]", "", s)
    if not s:
        return np.nan

    comma_count, dot_count = s.count(','), s.count('.')
    if comma_count and dot_count:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif comma_count:
        if comma_count > 1:
            s = s.replace(',', '')
        else:
            left, right = s.split(',', 1)
            s = left + right if (len(right) == 3 and len(left) >= 1) else left + '.' + right
    elif dot_count > 1:
        s = s.replace('.', '')

    try:
        return float(s) * sign * multiplier
    except ValueError:
        return np.nan


def _extract_price_candidates(raw_text) -> list:
    if pd.isna(raw_text) or not str(raw_text).strip():
        return []

    text    = str(raw_text)
    lowered = text.lower()
    search  = text.replace("'", " ")

    pattern = r"[+-]?\(?\d[\d\s\.,]*\d(?:\s*[kKmMbB])?\)?|[+-]?\(?\d(?:\s*[kKmMbB])?\)?"
    seen, candidates = set(), []

    for match in re.finditer(pattern, search):
        token = match.group(0).strip()
        if not token:
            continue
        if token.startswith('-') and match.start() > 0 and search[match.start() - 1].isdigit():
            token = token[1:].strip()
            if not token:
                continue

        number = _parse_number_token(token)
        if pd.isna(number):
            continue
        key = round(number, 8)
        if key in seen:
            continue
        seen.add(key)

        ctx = lowered[max(0, match.start() - 8):min(len(lowered), match.end() + 8)]
        score = 0
        if re.search(r"(eur|euro|EGP|usd|dollar|gbp|lei|ron|£|\$|€|¥|cad|aud|inr)", ctx):
            score += 4
        if re.search(r"[\.,]\d{1,4}", token):
            score += 2
        abs_val = abs(number)
        if abs_val >= 1:
            score += 1
        if 10 <= abs_val <= 10_000_000:
            score += 1

        candidates.append((float(number), score, token))

    return candidates


def pick_best_price(raw_text) -> float:
    candidates = _extract_price_candidates(raw_text)
    if not candidates:
        return np.nan
    best = sorted(candidates, key=lambda x: (x[1], abs(x[0])), reverse=True)[0]
    return float(best[0])


def coerce_numeric(series: pd.Series) -> pd.Series:
    """Parse a mixed-format string series into floats using pick_best_price."""
    normalized = series.replace({"": np.nan, "nan": np.nan, "None": np.nan, "null": np.nan})
    return normalized.apply(pick_best_price)


def maybe_numeric(series: pd.Series, min_ratio: float = 0.6):
    """Try to convert an object column to numeric. Returns (series, was_numeric)."""
    parsed = coerce_numeric(series)
    valid_ratio = parsed.notna().mean() if len(parsed) else 0.0
    if valid_ratio >= min_ratio:
        return parsed, True
    return series, False
