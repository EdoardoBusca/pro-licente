"""
analytics.py — SHAP explanations, ROI heatmap, arbitrage, sales velocity,
               price discovery waterfall, outlier detection, baseline forecast.
"""

import numpy as np
import pandas as pd

try:
    import shap
except Exception:
    shap = None

from .utils import canonical_name, coerce_numeric, find_column


# ─── Outlier Detection ─────────────────────────────────────────────────────────

def detect_price_outliers(df: pd.DataFrame, price_col: str, zip_col: str = "Zip_Code") -> list[int]:
    if price_col not in df.columns:
        return []

    temp = df.copy()
    temp[price_col] = coerce_numeric(temp[price_col])
    temp = temp.dropna(subset=[price_col]).reset_index()
    if temp.empty:
        return []

    if zip_col in temp.columns:
        grouped    = temp.groupby(zip_col)[price_col]
        local_med  = grouped.transform("median")
        local_mad  = grouped.transform(lambda x: np.median(np.abs(x - np.median(x))) if len(x) else 0.0)
        fallback   = float(np.median(np.abs(temp[price_col] - np.median(temp[price_col])))) + 1e-6
        scale      = np.where(local_mad > 0, local_mad, fallback)
        mask       = np.abs((temp[price_col] - local_med) / (1.4826 * scale + 1e-6)) > 3.5
    else:
        q1, q3 = temp[price_col].quantile(0.25), temp[price_col].quantile(0.75)
        iqr    = max(1e-6, q3 - q1)
        mask   = (temp[price_col] < q1 - 2.0 * iqr) | (temp[price_col] > q3 + 2.0 * iqr)

    return sorted(set(temp.loc[mask, "index"].astype(int).tolist()))


# ─── Sanity Warnings ───────────────────────────────────────────────────────────

def sales_sanity_warnings(df: pd.DataFrame, price_col: str) -> list[str]:
    if price_col not in df.columns:
        return []

    warnings = []
    prices   = coerce_numeric(df[price_col])

    bed_col = find_column(df.columns, ["bedroom", "bedrooms", "beds"])
    if bed_col is not None:
        beds  = coerce_numeric(df[bed_col])
        count = int(((beds <= 0) & (prices >= 1_000_000)).fillna(False).sum())
        if count > 0:
            warnings.append(f"Anomaly Detected: Possible Commercial Property in Residential set ({count} rows).")

    sqft_col = find_column(df.columns, ["sq_ft", "sqft", "square", "surface", "area"])
    if sqft_col is not None:
        sqft  = coerce_numeric(df[sqft_col])
        count = int(((sqft <= 200) & (prices >= 750_000)).fillna(False).sum())
        if count > 0:
            warnings.append(f"Sales Sanity: {count} assets show high price with unusually low area.")

    missing_ratio = float(prices.isna().mean()) if len(prices) else 0.0
    if missing_ratio > 0.2:
        warnings.append(f"Sales Sanity: {missing_ratio * 100:.1f}% of closing price values were non-numeric.")

    return warnings


# ─── ROI Heatmap ───────────────────────────────────────────────────────────────

def build_roi_heatmap(X: pd.DataFrame, y: pd.Series, top_n: int = 4) -> list[dict]:
    if X is None or X.empty:
        return []

    numeric_cols = [col for col in X.columns if pd.api.types.is_numeric_dtype(X[col])]
    if len(numeric_cols) < 2:
        return []

    corrs = [(col, float(X[col].corr(y))) for col in numeric_cols]
    corrs = [(col, c) for col, c in corrs if pd.notna(c) and np.isfinite(c)]
    if len(corrs) < 2:
        return []

    top     = sorted(corrs, key=lambda x: abs(x[1]), reverse=True)[:top_n]
    heatmap = []

    for i in range(len(top)):
        for j in range(i + 1, len(top)):
            fx, cx = top[i]
            fy, cy = top[j]
            x_s = pd.to_numeric(X[fx], errors="coerce")
            y_s = pd.to_numeric(X[fy], errors="coerce")
            t_s = pd.to_numeric(y,     errors="coerce")
            mask = x_s.notna() & y_s.notna() & t_s.notna()

            interaction_corr = 0.0
            if int(mask.sum()) >= 8:
                x_z = (x_s[mask] - x_s[mask].mean()) / (x_s[mask].std() + 1e-9)
                y_z = (y_s[mask] - y_s[mask].mean()) / (y_s[mask].std() + 1e-9)
                val = (x_z * y_z).corr(t_s[mask])
                if pd.notna(val) and np.isfinite(val):
                    interaction_corr = float(val)

            sales_lift = max(2.0, min(99.0,
                (abs(cx) + abs(cy)) * 15.0 + abs(interaction_corr) * 100.0
            ))
            heatmap.append({"feature_x": fx, "feature_y": fy, "sales_lift": sales_lift})

    return heatmap[:6]


# ─── Sales Velocity ────────────────────────────────────────────────────────────

def estimate_sales_velocity(history: list, r2: float, pred_std: float, source_df=None) -> dict:
    if not history:
        return {"expected_days_to_sell": 30, "narrative": "Based on current inventory, this asset is expected to close in 30 Days."}

    arr   = np.asarray(history, dtype=float)
    valid = arr[np.isfinite(arr)]
    if len(valid) < 2:
        return {"expected_days_to_sell": 30, "narrative": "Based on current inventory, this asset is expected to close in 30 Days."}

    pct_changes    = np.diff(valid) / (np.abs(valid[:-1]) + 1e-9)
    recent         = pct_changes[-min(6, len(valid) - 1):]
    momentum       = float(np.median(recent)) if len(recent) else 0.0
    volatility     = float(np.std(recent))    if len(recent) else float(pred_std)

    conf_penalty   = (1.0 - max(0.0, min(1.0, float(r2)))) * 18.0
    vol_penalty    = min(22.0, max(0.0, volatility * 95.0))
    momentum_bonus = max(-10.0, min(10.0, momentum * 120.0))
    rate_penalty = inventory_penalty = 0.0

    if isinstance(source_df, pd.DataFrame) and not source_df.empty:
        rate_col = find_column(source_df.columns, ["interest_rate", "interest", "mortgage_rate", "rate"])
        if rate_col:
            rates = coerce_numeric(source_df[rate_col]).dropna()
            if len(rates) >= 6:
                rate_penalty = max(-6.0, min(12.0, (float(rates.tail(3).mean()) - float(rates.median())) * 4.0))

        inv_col = find_column(source_df.columns, ["inventory", "listings", "supply", "active_listing", "stock"])
        if inv_col:
            inv = coerce_numeric(source_df[inv_col]).dropna()
            if len(inv) >= 6:
                ratio = (float(inv.tail(3).mean()) / (float(inv.median()) + 1e-9)) - 1.0
                inventory_penalty = max(-4.0, min(14.0, ratio * 16.0))

    days = int(round(max(7.0, min(120.0, 14.0 + conf_penalty + vol_penalty + rate_penalty + inventory_penalty - momentum_bonus))))
    liquidity = int(round(max(1.0, min(99.0, 100.0 - (days - 7.0) * (99.0 / 113.0)))))

    if days <= 7:
        label = "Hot Market - Expect sale within 7 days."
    elif days >= 45:
        label = "Cold Market - Asset may sit for 45+ days."
    else:
        label = "Balanced Market - Standard selling window expected."

    return {
        "expected_days_to_sell": days,
        "liquidity_score":       liquidity,
        "market_label":          label,
        "narrative":             f"Based on current inventory, this asset is expected to close in {days} Days.",
    }


# ─── Price Discovery Waterfall ─────────────────────────────────────────────────

def build_price_discovery(base_price, projection, feature_importance, correlations=None) -> list[dict]:
    base = float(base_price) if np.isfinite(base_price) else 0.0
    if base == 0.0:
        return []

    end   = float(projection[-1].get("val", base)) if projection else base
    delta = end - base or base * 0.03
    correlations = correlations or {}

    feats        = feature_importance or []
    total_weight = sum(abs(float(f.get("importance", 0.0))) for f in feats) or 1.0

    rows = [{"name": "Base Price", "change": base, "kind": "baseline"}]
    impacts = []
    for item in feats:
        name   = str(item.get("feature", "Market Factor"))
        weight = abs(float(item.get("importance", 0.0))) / total_weight
        corr   = float(correlations.get(name, 0.0))
        if corr != 0.0:
            sign = 1.0 if corr >= 0 else -1.0
        else:
            sign = -1.0 if any(t in name.lower() for t in ["interest", "rate", "age", "tax", "distance"]) else 1.0
        impacts.append({"name": name, "change": float(delta * weight * sign), "kind": "impact"})

    impacts.sort(key=lambda r: abs(r["change"]), reverse=True)
    rows.extend(impacts)
    rows.append({"name": "Final Price", "change": float(end), "kind": "final"})
    return rows


# ─── SHAP Explanation for a Single Property ────────────────────────────────────

def _drop_list_price(frame: pd.DataFrame) -> pd.DataFrame:
    blocked = [col for col in frame.columns if "list_price" in canonical_name(col)]
    return frame.drop(columns=blocked) if blocked else frame


def explain_property(model, X_train: pd.DataFrame, selected_row: pd.DataFrame, expected_value: float) -> list[dict]:
    base = float(expected_value) if np.isfinite(expected_value) else 0.0
    waterfall = [{"name": "Expected Value", "change": base, "kind": "baseline"}]

    if model is None or X_train is None or X_train.empty or selected_row is None or selected_row.empty:
        return waterfall

    background = _drop_list_price(X_train.copy())
    row        = _drop_list_price(selected_row.copy()).reindex(columns=background.columns, fill_value=0.0)

    try:
        predicted = float(model.predict(row)[0])

        if shap is None:
            waterfall.append({"name": "Model Adjustment", "change": predicted - base, "kind": "impact"})
            waterfall.append({"name": "Predicted Price",  "change": predicted,        "kind": "final"})
            return waterfall

        explainer = shap.Explainer(model, background)
        shap_vals = np.asarray(explainer(row).values[0], dtype=float).reshape(-1)
        shap_vals = np.where(np.isfinite(shap_vals), shap_vals, 0.0)

        # CatBoost/LightGBM SHAP values live in the model's raw-score space,
        # whose constant offset (e.g. CatBoost's bias = mean target) is NOT part
        # of explainer.expected_value. Deriving the baseline from the prediction
        # itself recovers the true expected prediction and guarantees the
        # waterfall reconciles exactly: baseline + sum(contributions) == predicted.
        base = float(predicted - shap_vals.sum())
        waterfall[0]["change"] = base
        contributions  = [
            {"name": feat, "change": float(val), "kind": "impact"}
            for feat, val in zip(row.columns, shap_vals)
            if "list_price" not in canonical_name(feat) and np.isfinite(val) and abs(val) >= 1e-9
        ]
        contributions.sort(key=lambda x: abs(x["change"]), reverse=True)
        waterfall.extend(contributions)

        waterfall.append({"name": "Predicted Price", "change": predicted, "kind": "final"})
    except Exception:
        try:
            predicted = float(model.predict(_drop_list_price(row))[0])
        except Exception:
            predicted = base
        waterfall.append({"name": "Model Adjustment", "change": predicted - base, "kind": "impact"})
        waterfall.append({"name": "Predicted Price",  "change": predicted,        "kind": "final"})

    return waterfall


# ─── Arbitrage Analysis ────────────────────────────────────────────────────────

def compute_arbitrage(df: pd.DataFrame, model, X_final: pd.DataFrame) -> dict:
    empty = {
        "undervalued_count": 0, "overpriced_count": 0,
        "buy_signals": [], "risk_signals": [],
        "valuation_delta_stats": {"mean_delta_pct": 0.0, "median_delta_pct": 0.0,
                                  "min_delta_pct": 0.0, "max_delta_pct": 0.0},
    }
    if "List_Price" not in df.columns:
        return empty

    try:
        list_prices     = pd.to_numeric(df["List_Price"], errors="coerce")
        predicted       = model.predict(X_final)
        valid           = list_prices.notna() & (list_prices > 0)
        deltas          = np.full(len(predicted), np.nan)
        deltas[valid]   = np.clip(
            ((predicted[valid] - list_prices[valid]) / list_prices[valid]) * 100, -500.0, 500.0
        )

        under_mask = deltas > 10
        over_mask  = deltas < -10
        valid_mask = ~np.isnan(deltas)

        def _signals(indices, key, label):
            return [
                {
                    "property_idx": int(i),
                    "delta_pct":    float(deltas[i]),
                    "list_price":   float(list_prices.iloc[i]) if pd.notna(list_prices.iloc[i]) else 0,
                    "ai_value":     float(predicted[i]),
                    key:            float(abs(predicted[i] - list_prices.iloc[i])) if pd.notna(list_prices.iloc[i]) else 0,
                    "alert":        label,
                }
                for i in indices
            ]

        result = {**empty}
        result["undervalued_count"] = int(np.sum(under_mask))
        result["overpriced_count"]  = int(np.sum(over_mask))

        if np.sum(under_mask):
            top = sorted(np.where(under_mask)[0], key=lambda i: deltas[i], reverse=True)[:5]
            result["buy_signals"] = _signals(top, "potential_gain", "UNDERVALUED / BUY SIGNAL")

        if np.sum(over_mask):
            top = sorted(np.where(over_mask)[0], key=lambda i: deltas[i])[:5]
            result["risk_signals"] = _signals(top, "potential_loss", "OVERPRICED / RISK")

        if np.sum(valid_mask):
            v = deltas[valid_mask]
            result["valuation_delta_stats"] = {
                "mean_delta_pct":   float(np.mean(v)),
                "median_delta_pct": float(np.median(v)),
                "min_delta_pct":    float(np.min(v)),
                "max_delta_pct":    float(np.max(v)),
            }
        return result
    except Exception as e:
        print(f"Arbitrage error: {e}")
        return empty


# ─── Baseline Forecast (used when dataset is too small to train) ───────────────

def baseline_forecast(history_values: list, horizon: int, label: str) -> dict:
    history = [float(v) for v in history_values if pd.notna(v)]
    if not history:
        raise ValueError("No valid numeric values were found in the selected target column.")

    drift = (history[-1] - history[-2]) if len(history) >= 2 else 0.0

    look_back = min(30, len(history))
    historical_data = [
        {"day": f"Day -{look_back - i}", "val": float(v), "is_historical": True}
        for i, v in enumerate(history[-look_back:])
    ]
    projection = [
        {"day": f"Day {i + 1}", "val": float(history[-1] + drift * (i + 1)), "is_historical": False}
        for i in range(horizon)
    ]

    velocity  = estimate_sales_velocity(history, 0.0, 0.0)
    discovery = build_price_discovery(history[-1], projection, [], None)

    return {
        "winner": label, "r2_score": 0.0, "mae": 0.0, "rmse": 0.0, "mape": 0.0,
        "residuals": [], "train_size": len(history), "test_size": 0,
        "split_ratio": "N/A", "leaderboard": [{"name": label, "r2": 0.0, "mae": 0.0, "rmse": 0.0, "mape": 0.0}],
        "model_failures": [], "insights": [], "feature_importance": [],
        "correlation_matrix": [], "prediction_std": 0.0,
        "composite_confidence_score": 28, "stratified_accuracy": 28,
        "primary_metric": "MAPE",
        "ai_precision_label": "AI Precision: Baseline mode due to insufficient data.",
        "market_sentiment_monthly": 0.0,
        "projection": projection, "historical_data": historical_data,
        "full_chart_data": historical_data + projection,
        "model_diagnostics": {
            "data_density": "Low Sample Size - Baseline mode",
            "confidence_level": "Low",
            "sample_size": len(history),
            "residual_stats": {},
            "feature_engineering": {
                "total_features": 0, "temporal_features": 0,
                "categorical_features_onehot": 0,
                "leakage_removed": ["List_Price", "Date_Listed"],
                "categorical_encoding": "N/A", "allowed_input_features": [],
                "dominance_verification": {
                    "sq_ft_total_in_top5": False, "zip_code_in_top5": False,
                    "status": "CHECK",
                    "message": "Baseline forecast does not compute feature importance.",
                },
            },
        },
        "market_dynamics": {
            "roi_heatmap": [], "sales_velocity": velocity,
            "price_discovery": discovery, "lead_lag": [],
            "temporal_analysis": {
                "market_cycle": "Balanced (Insufficient History)",
                "yoy_appreciation_metrics": [],
                "temporal_weighting": "Not applied in baseline mode",
            },
        },
        "arbitrage": {
            "undervalued_count": 0, "overpriced_count": 0,
            "buy_signals": [], "risk_signals": [],
            "valuation_delta_stats": {"mean_delta_pct": 0.0, "median_delta_pct": 0.0,
                                      "min_delta_pct": 0.0, "max_delta_pct": 0.0},
        },
        "data_quality": {
            "total_rows": len(history),
            "warnings": ["Baseline model used - insufficient data for training"],
            "outlier_row_numbers": [], "excluded_outliers": 0,
        },
    }
