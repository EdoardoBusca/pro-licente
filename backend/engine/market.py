"""
market.py — Temporal analysis: YoY appreciation, market cycle, temporal weights, lead-lag.
"""

import numpy as np
import pandas as pd

from .utils import coerce_numeric, find_column


def compute_yoy_appreciation(df: pd.DataFrame, price_col: str, date_col: str) -> list[dict]:
    if date_col not in df.columns or price_col not in df.columns:
        return []

    temp = df.copy()
    temp[date_col]  = pd.to_datetime(temp[date_col], errors="coerce")
    temp[price_col] = coerce_numeric(temp[price_col])
    temp = temp.dropna(subset=[date_col, price_col])
    if len(temp) < 2:
        return []

    temp["year"]  = temp[date_col].dt.year
    yearly        = temp.groupby("year")[price_col].agg(["mean", "count"]).reset_index()
    yearly        = yearly.sort_values("year").reset_index(drop=True)

    metrics = []
    for i in range(1, len(yearly)):
        prev_avg = float(yearly.iloc[i - 1]["mean"])
        curr_avg = float(yearly.iloc[i]["mean"])
        if prev_avg > 0:
            metrics.append({
                "year":             int(yearly.iloc[i]["year"]),
                "price_avg":        curr_avg,
                "yoy_appreciation": ((curr_avg - prev_avg) / prev_avg) * 100.0,
                "sample_count":     int(yearly.iloc[i]["count"]),
            })
    return metrics


def compute_market_cycle(yoy_metrics: list[dict]) -> str:
    if not yoy_metrics or len(yoy_metrics) < 2:
        return "Balanced (Insufficient History)"

    lookback = yoy_metrics[-min(3, len(yoy_metrics)):]
    valid    = [m["yoy_appreciation"] for m in lookback
                if isinstance(m.get("yoy_appreciation"), (int, float))
                and np.isfinite(m["yoy_appreciation"])]
    if not valid:
        return "Balanced (Insufficient History)"

    recent = float(np.mean(valid))
    if recent > 8.0:
        return f"Hot Market - {recent:.1f}% YoY appreciation (Expansion Phase)"
    elif recent > 3.0:
        return f"Balanced Market - {recent:.1f}% YoY appreciation"
    elif recent > 0.0:
        return f"Slowing Market - {recent:.1f}% YoY appreciation (Below Inflation)"
    else:
        return f"Cold Market - {recent:.1f}% YoY depreciation (Contraction Phase)"


def compute_temporal_weights(df: pd.DataFrame, date_col: str) -> np.ndarray:
    if date_col not in df.columns:
        return np.ones(len(df))

    dates    = pd.to_datetime(df[date_col], errors="coerce")
    min_date = dates.min()
    max_date = dates.max()

    if pd.isna(min_date) or pd.isna(max_date) or min_date == max_date:
        return np.ones(len(df))

    span      = (max_date - min_date).total_seconds()
    positions = (dates - min_date).dt.total_seconds().fillna(0.0) / span
    weights   = 0.1 + (np.exp(2.0 * positions) - 1.0) / (np.exp(2.0) - 1.0) * 0.9
    return np.clip(weights.values, 0.1, 1.0)


def compute_lead_lag(df: pd.DataFrame, target: pd.Series, max_lag: int = 6) -> list[dict]:
    interest_col = find_column(
        df.columns, ["interest_rate", "interest", "mortgage_rate", "financing_rate", "rate"]
    )
    if interest_col is None:
        return []

    interest = coerce_numeric(df[interest_col])
    results  = []
    for lag in range(1, max_lag + 1):
        corr = interest.shift(lag).corr(target)
        if pd.notna(corr) and np.isfinite(corr):
            results.append({"lag": lag, "correlation": float(corr)})

    results.sort(key=lambda x: abs(x["correlation"]), reverse=True)
    return results[:4]
