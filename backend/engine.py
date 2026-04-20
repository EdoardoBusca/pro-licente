"""
engine.py — Estate Vantage ML Training Engine

Entry point: train_logic(df, target_col, horizon)

Pipeline:
  1. Data cleaning  — coerce types, detect/remove outliers, sort by date
  2. Feature sanitization — whitelist-only features, one-hot encode categories,
                            block List_Price leakage, scale with StandardScaler
  3. Train/test split  — temporal (chronological), 80/20 or 85/15 for small sets
  4. Battle of the Bots — fit Linear Regression, Random Forest, XGBoost,
                          CatBoost, LightGBM; pick winner by lowest MAPE
  5. Projection      — anchor prediction on median feature profile + momentum
  6. Analytics       — SHAP feature importance, ROI heatmap, arbitrage signals,
                       sales velocity, price discovery waterfall, lead-lag
"""

import os
import pandas as pd
import numpy as np
import re

try:
    import shap
except Exception:
    shap = None

try:
    import xgboost as xgb
except Exception:
    xgb = None

try:
    import lightgbm as lgb
except Exception:
    lgb = None

try:
    from catboost import CatBoostRegressor
except Exception:
    CatBoostRegressor = None

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.base import clone
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit


def _parse_localized_number_token(value):
    if pd.isna(value):
        return np.nan

    s = str(value).strip()
    if not s:
        return np.nan

    s = s.replace('\u00a0', ' ').replace('\u202f', ' ')
    s = re.sub(r"\s+", "", s)
    s = s.replace("'", "")

    sign = 1
    if s.startswith('(') and s.endswith(')'):
        sign = -1
        s = s[1:-1]
    if s.startswith('+'):
        s = s[1:]
    elif s.startswith('-'):
        sign *= -1
        s = s[1:]

    # Handle compact units (k/m/b), e.g. 1.2k, 3m.
    multiplier = 1.0
    match = re.search(r"([kmb])$", s.lower())
    if match:
        unit = match.group(1)
        if unit == 'k':
            multiplier = 1_000.0
        elif unit == 'm':
            multiplier = 1_000_000.0
        elif unit == 'b':
            multiplier = 1_000_000_000.0
        s = s[:-1]

    s = re.sub(r"[^\d,\.]", "", s)
    if not s:
        return np.nan

    comma_count = s.count(',')
    dot_count = s.count('.')

    if comma_count and dot_count:
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')
        if last_comma > last_dot:
            # Decimal comma style: 1.234.567,89
            s = s.replace('.', '')
            s = s.replace(',', '.')
        else:
            # Decimal dot style: 1,234,567.89
            s = s.replace(',', '')
    elif comma_count:
        if comma_count > 1:
            # Multiple commas are usually thousands separators.
            s = s.replace(',', '')
        else:
            left, right = s.split(',', 1)
            if len(right) == 3 and len(left) >= 1:
                s = left + right
            else:
                s = left + '.' + right
    elif dot_count > 1:
        # Multiple dots are usually thousands separators.
        s = s.replace('.', '')

    try:
        return float(s) * sign * multiplier
    except ValueError:
        return np.nan


def _extract_price_candidates(raw_text):
    if pd.isna(raw_text):
        return []

    text = str(raw_text)
    if not text.strip():
        return []

    lowered = text.lower()
    search_text = text.replace("'", " ")
    candidates = []

    # Match broad numeric runs so mixed separators like 1,234.56 or 1.234,56 are kept whole.
    token_pattern = r"[+-]?\(?\d[\d\s\.,]*\d(?:\s*[kKmMbB])?\)?|[+-]?\(?\d(?:\s*[kKmMbB])?\)?"
    for match in re.finditer(token_pattern, search_text):
        token = match.group(0).strip()
        if not token:
            continue

        # Treat range separators as delimiters (1000-1200), not negative signs.
        if token.startswith('-') and match.start() > 0 and search_text[match.start() - 1].isdigit():
            token = token[1:].strip()
            if not token:
                continue

        number = _parse_localized_number_token(token)
        if pd.isna(number):
            continue

        start = max(0, match.start() - 8)
        end = min(len(lowered), match.end() + 8)
        context = lowered[start:end]
        currency_hint = bool(re.search(r"(eur|euro|EGP|usd|dollar|gbp|lei|ron|£|\$|€|¥|cad|aud|inr)", context))
        has_decimal = bool(re.search(r"[\.,]\d{1,4}", token))
        abs_val = abs(number)

        # Score candidates so we can pick the most likely "price" value in noisy text.
        score = 0
        if currency_hint:
            score += 4
        if has_decimal:
            score += 2
        if abs_val >= 1:
            score += 1
        if 10 <= abs_val <= 10_000_000:
            score += 1

        candidates.append((float(number), score, token))

    # Keep insertion order but remove near-duplicate parsed values.
    seen = set()
    deduped = []
    for value, score, token in candidates:
        key = round(value, 8)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((value, score, token))

    return deduped


def _pick_best_price_value(raw_text):
    candidates = _extract_price_candidates(raw_text)
    if not candidates:
        return np.nan

    # Sort by score first, then by absolute value to favor realistic final amounts.
    best = sorted(candidates, key=lambda x: (x[1], abs(x[0])), reverse=True)[0]
    return float(best[0])


def _coerce_numeric_target(series):
    normalized = series.replace({"": np.nan, "nan": np.nan, "None": np.nan, "null": np.nan})
    return normalized.apply(_pick_best_price_value)


def _maybe_convert_object_column_to_numeric(series, min_ratio=0.6):
    parsed = _coerce_numeric_target(series)
    valid_ratio = parsed.notna().mean() if len(parsed) else 0.0
    if valid_ratio >= min_ratio:
        return parsed, True
    return series, False


def _find_column_by_keywords(columns, keywords):
    lowered = {str(col).lower().strip(): col for col in columns}
    for key in keywords:
        for lowered_name, original_name in lowered.items():
            if key in lowered_name:
                return original_name
    return None


def _sales_sanity_warnings(df, price_col):
    warnings = []
    if price_col not in df.columns:
        return warnings

    price_values = _coerce_numeric_target(df[price_col])

    bedrooms_col = _find_column_by_keywords(df.columns, ["bedroom", "bedrooms", "beds"])
    if bedrooms_col is not None:
        bedrooms = _coerce_numeric_target(df[bedrooms_col])
        anomaly_mask = (bedrooms <= 0) & (price_values >= 1_000_000)
        anomaly_count = int(anomaly_mask.fillna(False).sum())
        if anomaly_count > 0:
            warnings.append(
                f"Anomaly Detected: Possible Commercial Property detected in Residential set ({anomaly_count} rows)."
            )

    sqft_col = _find_column_by_keywords(df.columns, ["sq_ft", "sqft", "square", "surface", "area"])
    if sqft_col is not None:
        sqft = _coerce_numeric_target(df[sqft_col])
        density_mask = (sqft <= 200) & (price_values >= 750_000)
        density_count = int(density_mask.fillna(False).sum())
        if density_count > 0:
            warnings.append(
                f"Sales Sanity: {density_count} assets show high price with unusually low area; verify classification."
            )

    missing_target_ratio = float(price_values.isna().mean()) if len(price_values) else 0.0
    if missing_target_ratio > 0.2:
        warnings.append(
            f"Sales Sanity: {missing_target_ratio * 100:.1f}% of projected closing price values were non-numeric or empty."
        )

    return warnings


def _compute_lead_lag_analysis(df, target_series, max_lag=6):
    interest_col = _find_column_by_keywords(
        df.columns,
        ["interest_rate", "interest", "mortgage_rate", "financing_rate", "rate"]
    )
    if interest_col is None:
        return []

    interest_series = _coerce_numeric_target(df[interest_col])
    lead_lag = []
    for lag in range(1, max_lag + 1):
        shifted_interest = interest_series.shift(lag)
        corr = shifted_interest.corr(target_series)
        if pd.notna(corr) and np.isfinite(corr):
            lead_lag.append({"lag": int(lag), "correlation": float(corr)})

    lead_lag.sort(key=lambda item: abs(item["correlation"]), reverse=True)
    return lead_lag[:4]


def _build_roi_heatmap(features_df, target_series, top_n=4):
    if features_df is None or features_df.empty:
        return []

    numeric_cols = [col for col in features_df.columns if pd.api.types.is_numeric_dtype(features_df[col])]
    if len(numeric_cols) < 2:
        return []

    corrs = []
    for col in numeric_cols:
        corr = features_df[col].corr(target_series)
        if pd.notna(corr) and np.isfinite(corr):
            corrs.append((col, float(corr)))

    if len(corrs) < 2:
        return []

    top = sorted(corrs, key=lambda item: abs(item[1]), reverse=True)[:top_n]

    heatmap = []
    for i in range(len(top)):
        for j in range(i + 1, len(top)):
            feature_x, corr_x = top[i]
            feature_y, corr_y = top[j]

            # Use interaction signal (x * y) against target as a proxy for feature-pair sales lift.
            x_series = pd.to_numeric(features_df[feature_x], errors='coerce')
            y_series = pd.to_numeric(features_df[feature_y], errors='coerce')
            target_numeric = pd.to_numeric(target_series, errors='coerce')
            valid_mask = x_series.notna() & y_series.notna() & target_numeric.notna()

            interaction_corr = 0.0
            if int(valid_mask.sum()) >= 8:
                x_vals = x_series[valid_mask]
                y_vals = y_series[valid_mask]
                t_vals = target_numeric[valid_mask]

                x_std = float(x_vals.std())
                y_std = float(y_vals.std())
                if x_std > 0 and y_std > 0:
                    x_z = (x_vals - float(x_vals.mean())) / x_std
                    y_z = (y_vals - float(y_vals.mean())) / y_std
                    interaction_term = x_z * y_z
                    corr_val = interaction_term.corr(t_vals)
                    if pd.notna(corr_val) and np.isfinite(corr_val):
                        interaction_corr = float(corr_val)

            # Blend pairwise direct strength and interaction strength into a bounded lift score.
            direct_strength = (abs(corr_x) + abs(corr_y)) * 15.0
            interaction_strength = abs(interaction_corr) * 100.0
            sales_lift = max(2.0, min(99.0, direct_strength + interaction_strength))
            heatmap.append(
                {
                    "feature_x": str(feature_x),
                    "feature_y": str(feature_y),
                    "sales_lift": float(sales_lift)
                }
            )

    return heatmap[:6]


def _estimate_sales_velocity(history_values, r2_score, prediction_std, source_df=None):
    if not history_values:
        return {"expected_days_to_sell": 30, "narrative": "Based on current inventory, this asset is expected to close in 30 Days."}

    history = np.asarray(history_values, dtype=float)
    valid_history = history[np.isfinite(history)]
    if len(valid_history) < 2:
        return {"expected_days_to_sell": 30, "narrative": "Based on current inventory, this asset is expected to close in 30 Days."}

    pct_changes = np.diff(valid_history) / (np.abs(valid_history[:-1]) + 1e-9)
    recent_window = min(6, len(valid_history) - 1)
    recent_changes = pct_changes[-recent_window:] if recent_window > 0 else pct_changes

    momentum = float(np.median(recent_changes)) if len(recent_changes) > 0 else 0.0
    volatility = float(np.std(recent_changes)) if len(recent_changes) > 0 else float(prediction_std)

    confidence_penalty = (1.0 - max(0.0, min(1.0, float(r2_score)))) * 18.0
    volatility_penalty = min(22.0, max(0.0, volatility * 95.0))
    momentum_bonus = max(-10.0, min(10.0, momentum * 120.0))

    rate_penalty = 0.0
    inventory_penalty = 0.0
    if source_df is not None and isinstance(source_df, pd.DataFrame) and not source_df.empty:
        interest_col = _find_column_by_keywords(
            source_df.columns,
            ["interest_rate", "interest", "mortgage_rate", "financing_rate", "rate"]
        )
        if interest_col is not None:
            interest_series = _coerce_numeric_target(source_df[interest_col]).dropna()
            if len(interest_series) >= 6:
                recent_rate = float(interest_series.tail(3).mean())
                long_rate = float(interest_series.median())
                rate_penalty = max(-6.0, min(12.0, (recent_rate - long_rate) * 4.0))

        inventory_col = _find_column_by_keywords(
            source_df.columns,
            ["inventory", "listings", "supply", "active_listing", "stock"]
        )
        if inventory_col is not None:
            inventory_series = _coerce_numeric_target(source_df[inventory_col]).dropna()
            if len(inventory_series) >= 6:
                recent_inventory = float(inventory_series.tail(3).mean())
                baseline_inventory = float(inventory_series.median()) + 1e-9
                inventory_ratio = (recent_inventory / baseline_inventory) - 1.0
                inventory_penalty = max(-4.0, min(14.0, inventory_ratio * 16.0))

    expected_days = int(round(max(7.0, min(120.0, 14.0 + confidence_penalty + volatility_penalty + rate_penalty + inventory_penalty - momentum_bonus))))
    liquidity_score = int(round(max(1.0, min(99.0, 100.0 - (expected_days - 7.0) * (99.0 / 113.0)))))

    if expected_days <= 7:
        market_label = "Hot Market - Expect sale within 7 days."
    elif expected_days >= 45:
        market_label = "Cold Market - Asset may sit for 45+ days."
    else:
        market_label = "Balanced Market - Standard selling window expected."

    narrative = f"Based on current inventory, this asset is expected to close in {expected_days} Days."
    return {
        "expected_days_to_sell": expected_days,
        "liquidity_score": liquidity_score,
        "market_label": market_label,
        "narrative": narrative
    }


def _safe_mape(y_true, y_pred):
    y_true_arr = np.asarray(y_true, dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)
    # Filter rows where true value is zero or non-finite — they blow up MAPE
    valid = np.isfinite(y_true_arr) & np.isfinite(y_pred_arr) & (np.abs(y_true_arr) > 1.0)
    if not np.any(valid):
        return 0.0
    return float(np.mean(np.abs((y_true_arr[valid] - y_pred_arr[valid]) / np.abs(y_true_arr[valid]))) * 100.0)


def _canonical_feature_name(name):
    return str(name).strip().lower().replace(" ", "_")


def _is_id_or_index_column(name):
    normalized = _canonical_feature_name(name)
    if normalized in {"id", "idx", "index", "row_id", "listing_id", "property_id", "mls_id"}:
        return True
    return normalized.endswith("_id") or normalized.startswith("id_") or "index" in normalized


def _detect_price_outliers(df, price_col, zip_col="Zip_Code"):
    if price_col not in df.columns:
        return []

    temp = df.copy()
    temp[price_col] = _coerce_numeric_target(temp[price_col])
    temp = temp.dropna(subset=[price_col]).reset_index()
    if temp.empty:
        return []

    if zip_col in temp.columns:
        grouped = temp.groupby(zip_col)[price_col]
        local_median = grouped.transform("median")
        local_mad = grouped.transform(lambda x: np.median(np.abs(x - np.median(x))) if len(x) else 0.0)
        fallback_mad = float(np.median(np.abs(temp[price_col] - np.median(temp[price_col])))) + 1e-6
        robust_scale = np.where(local_mad > 0, local_mad, fallback_mad)
        robust_z = np.abs((temp[price_col] - local_median) / (1.4826 * robust_scale + 1e-6))
        mask = robust_z > 3.5
    else:
        q1 = float(temp[price_col].quantile(0.25))
        q3 = float(temp[price_col].quantile(0.75))
        iqr = max(1e-6, q3 - q1)
        lower = q1 - 2.0 * iqr
        upper = q3 + 2.0 * iqr
        mask = (temp[price_col] < lower) | (temp[price_col] > upper)

    outlier_rows = temp.loc[mask, "index"].astype(int).tolist()
    return sorted(set(outlier_rows))


def _build_price_discovery(base_price, projection, feature_importance, feature_correlations=None):
    base_value = float(base_price) if np.isfinite(base_price) else 0.0
    if base_value == 0.0:
        return []

    projected_end = base_value
    if projection:
        projected_end = float(projection[-1].get("val", base_value))

    delta_total = projected_end - base_value
    if abs(delta_total) < 1e-9:
        delta_total = base_value * 0.03

    ranked_features = feature_importance[:3] if feature_importance else []
    total_weight = sum(abs(float(item.get("importance", 0.0))) for item in ranked_features) or 1.0
    feature_correlations = feature_correlations or {}

    rows = [{"name": "Base Price", "change": base_value}]
    contribution_budget = delta_total  # allocate 100% to features; Market Momentum absorbs the residual

    for item in ranked_features:
        raw_name = str(item.get("feature", "Market Factor"))
        weight = abs(float(item.get("importance", 0.0))) / total_weight

        corr_val = float(feature_correlations.get(raw_name, 0.0))
        if corr_val != 0.0:
            # Always trust the actual data correlation direction, even if weak.
            # Only fall back to keyword heuristics when no correlation data exists at all.
            sign = 1.0 if corr_val >= 0 else -1.0
        else:
            directional_negative = any(token in raw_name.lower() for token in ["interest", "rate", "age", "tax", "distance"])
            sign = -1.0 if directional_negative else 1.0

        change = contribution_budget * weight * sign
        rows.append({"name": raw_name, "change": float(change)})

    accounted = sum(row["change"] for row in rows)
    rows.append({"name": "Market Momentum", "change": float(projected_end - accounted)})
    return rows


def _drop_list_price_columns(frame):
    if frame is None or frame.empty:
        return frame
    blocked = [col for col in frame.columns if "list_price" in _canonical_feature_name(col)]
    if not blocked:
        return frame
    return frame.drop(columns=blocked)


def _predict_selected_property(model, selected_row):
    if model is None or selected_row is None or selected_row.empty:
        return 0.0
    row = _drop_list_price_columns(selected_row.copy())
    return float(model.predict(row)[0])


def _explain_selected_property(model, X_train, selected_row, dataset_expected_value):
    expected_value = float(dataset_expected_value) if np.isfinite(dataset_expected_value) else 0.0
    waterfall = [{"name": "Expected Value", "change": expected_value, "kind": "baseline"}]

    if model is None or X_train is None or X_train.empty or selected_row is None or selected_row.empty:
        return waterfall

    # DATA LEAKAGE VETO: ensure List_Price never enters local explanation features.
    background = _drop_list_price_columns(X_train.copy())
    row = _drop_list_price_columns(selected_row.copy())
    row = row.reindex(columns=background.columns, fill_value=0.0)

    try:
        predicted_value = float(model.predict(row)[0])

        if shap is None:
            waterfall.append({"name": "Model Adjustment", "change": float(predicted_value - expected_value), "kind": "impact"})
            waterfall.append({"name": "Predicted Price", "change": predicted_value, "kind": "final"})
            return waterfall

        # SHAP integration requested: train explainer on X_train background.
        explainer = shap.Explainer(model, background)
        base_raw = np.asarray(explainer.expected_value).reshape(-1)
        if len(base_raw) > 0 and np.isfinite(base_raw[0]):
            expected_value = float(base_raw[0])
            waterfall[0]["change"] = expected_value

        # Calculate local SHAP impacts for ONE specific house.
        shap_result = explainer(row)
        shap_impacts = np.asarray(shap_result.values[0], dtype=float).reshape(-1)
        feature_names = list(row.columns)

        contributions = []
        for feat_name, shap_val in zip(feature_names, shap_impacts):
            canonical = _canonical_feature_name(feat_name)
            if "list_price" in canonical:
                continue
            if not np.isfinite(shap_val) or abs(float(shap_val)) < 1e-9:
                continue
            contributions.append({"name": str(feat_name), "change": float(shap_val), "kind": "impact"})

        contributions.sort(key=lambda item: abs(item["change"]), reverse=True)
        waterfall.extend(contributions)

        recomposed = expected_value + float(np.sum([item["change"] for item in contributions]))
        reconciliation = predicted_value - recomposed
        # Threshold: 0.1% of predicted value — currency-independent
        if abs(reconciliation) > max(1.0, abs(predicted_value) * 0.001):
            waterfall.append({"name": "Other Factors", "change": float(reconciliation), "kind": "impact"})

        waterfall.append({"name": "Predicted Price", "change": predicted_value, "kind": "final"})
        return waterfall
    except Exception:
        predicted_value = _predict_selected_property(model, row)
        waterfall.append({"name": "Model Adjustment", "change": float(predicted_value - expected_value), "kind": "impact"})
        waterfall.append({"name": "Predicted Price", "change": predicted_value, "kind": "final"})
        return waterfall


def _baseline_forecast(history_values, horizon, label):
    history = [float(value) for value in history_values if pd.notna(value)]
    if not history:
        raise ValueError("No valid numeric values were found in the selected target column.")

    if len(history) >= 2:
        drift = history[-1] - history[-2]
    else:
        drift = 0.0

    # --- HISTORICAL DATA (Last 30 days) ---
    historical_data = []
    look_back = min(30, len(history))
    for i, val in enumerate(history[-look_back:]):
        historical_data.append({"day": f"Day -{look_back - i}", "val": float(val), "is_historical": True})

    projection = []
    for index in range(horizon):
        predicted = history[-1] + drift * (index + 1)
        projection.append({"day": f"Day {index + 1}", "val": float(predicted), "is_historical": False})

    full_chart_data = historical_data + projection
    sales_velocity = _estimate_sales_velocity(history, 0.0, 0.0)
    price_discovery = _build_price_discovery(history[-1], projection, [], None)

    composite_confidence_score = 28

    return {
        "winner": label,
        "r2_score": 0.0,
        "mae": 0.0,
        "rmse": 0.0,
        "mape": 0.0,
        "residuals": [],
        "train_size": len(history),
        "test_size": 0,
        "split_ratio": "N/A",
        "leaderboard": [{"name": label, "r2": 0.0, "mae": 0.0, "rmse": 0.0, "mape": 0.0}],
        "model_failures": [],
        "insights": [],
        "feature_importance": [],
        "correlation_matrix": [],
        "prediction_std": 0.0,
        "composite_confidence_score": composite_confidence_score,
        "stratified_accuracy": composite_confidence_score,
        "primary_metric": "MAPE",
        "ai_precision_label": "AI Precision: Baseline mode due to insufficient data.",
        "market_sentiment_monthly": 0.0,
        "projection": projection,
        "historical_data": historical_data,
        "full_chart_data": full_chart_data,
        "model_diagnostics": {
            "data_density": "Low Sample Size - Baseline mode",
            "confidence_level": "Low",
            "sample_size": len(history),
            "residual_stats": {},
            "feature_engineering": {
                "total_features": 0,
                "temporal_features": 0,
                "categorical_features_onehot": 0,
                "leakage_removed": ["List_Price", "Date_Listed"],
                "categorical_encoding": "N/A",
                "allowed_input_features": [],
                "dominance_verification": {
                    "sq_ft_total_in_top5": False,
                    "zip_code_in_top5": False,
                    "status": "CHECK",
                    "message": "Baseline forecast does not compute feature importance."
                }
            }
        },
        "market_dynamics": {
            "roi_heatmap": [],
            "sales_velocity": sales_velocity,
            "price_discovery": price_discovery,
            "lead_lag": [],
            "temporal_analysis": {
                "market_cycle": "Balanced (Insufficient History)",
                "yoy_appreciation_metrics": [],
                "temporal_weighting": "Not applied in baseline mode"
            }
        },
        "arbitrage": {
            "undervalued_count": 0,
            "overpriced_count": 0,
            "buy_signals": [],
            "risk_signals": [],
            "valuation_delta_stats": {
                "mean_delta_pct": 0.0,
                "median_delta_pct": 0.0,
                "min_delta_pct": 0.0,
                "max_delta_pct": 0.0
            }
        },
        "data_quality": {
            "total_rows": len(history),
            "warnings": ["Baseline model used - insufficient data for training"],
            "outlier_row_numbers": [],
            "excluded_outliers": 0
        }
    }

def _calculate_yoy_appreciation(df, price_col, date_col):
    if date_col not in df.columns or price_col not in df.columns:
        return []
    
    temp = df.copy()
    temp[date_col] = pd.to_datetime(temp[date_col], errors='coerce')
    temp[price_col] = _coerce_numeric_target(temp[price_col])
    temp = temp.dropna(subset=[date_col, price_col])
    
    if len(temp) < 2:
        return []
    
    temp['year'] = temp[date_col].dt.year
    yearly_avg = temp.groupby('year')[price_col].agg(['mean', 'count']).reset_index()
    yearly_avg = yearly_avg.sort_values('year').reset_index(drop=True)
    
    yoy_metrics = []
    for i in range(1, len(yearly_avg)):
        prev_avg = float(yearly_avg.iloc[i-1]['mean'])
        curr_avg = float(yearly_avg.iloc[i]['mean'])
        
        if prev_avg > 0:
            yoy_rate = ((curr_avg - prev_avg) / prev_avg) * 100.0
            yoy_metrics.append({
                "year": int(yearly_avg.iloc[i]['year']),
                "price_avg": float(curr_avg),
                "yoy_appreciation": float(yoy_rate),
                "sample_count": int(yearly_avg.iloc[i]['count'])
            })
    
    return yoy_metrics

def _calculate_temporal_weights(df, date_col):
    if date_col not in df.columns:
        return np.ones(len(df))

    dates = pd.to_datetime(df[date_col], errors='coerce')
    min_date, max_date = dates.min(), dates.max()

    if pd.isna(min_date) or pd.isna(max_date) or min_date == max_date:
        return np.ones(len(df))

    time_span = (max_date - min_date).total_seconds()
    positions = (dates - min_date).dt.total_seconds().fillna(0.0) / time_span
    exp_weights = np.exp(2.0 * positions)
    weights = 0.1 + (exp_weights - 1.0) / (np.exp(2.0) - 1.0) * 0.9
    return np.clip(weights.values, 0.1, 1.0)

def _calculate_market_cycle(yoy_metrics):
    if not yoy_metrics or len(yoy_metrics) < 2:
        return "Balanced (Insufficient History)"

    # Average last 3 years (or all available) to smooth single-year noise
    lookback = yoy_metrics[-min(3, len(yoy_metrics)):]
    valid_rates = [m["yoy_appreciation"] for m in lookback
                   if isinstance(m.get("yoy_appreciation"), (int, float))
                   and np.isfinite(m["yoy_appreciation"])]
    if not valid_rates:
        return "Balanced (Insufficient History)"
    recent_yoy = float(np.mean(valid_rates))

    # Thresholds account for ~3% baseline inflation:
    # >8% = clearly above inflation (Hot), 3–8% = real gains (Balanced),
    # 0–3% = at or below inflation (Slowing), <0% = nominal decline (Cold)
    if recent_yoy > 8.0:
        return f"Hot Market - {recent_yoy:.1f}% YoY appreciation (Expansion Phase)"
    elif recent_yoy > 3.0:
        return f"Balanced Market - {recent_yoy:.1f}% YoY appreciation"
    elif recent_yoy > 0.0:
        return f"Slowing Market - {recent_yoy:.1f}% YoY appreciation (Below Inflation)"
    else:
        return f"Cold Market - {recent_yoy:.1f}% YoY depreciation (Contraction Phase)"

# In-memory model store: job_id → {model, scaler, features}
_model_store: dict = {}

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(_MODELS_DIR, exist_ok=True)


def _model_path(job_id: str) -> str:
    return os.path.join(_MODELS_DIR, f"{job_id}.pkl")


def get_model_state(job_id: str):
    # Check memory first (fast path)
    if job_id in _model_store:
        return _model_store[job_id]
    # Fall back to disk (survives server restarts)
    path = _model_path(job_id)
    if os.path.exists(path):
        try:
            import joblib
            state = joblib.load(path)
            _model_store[job_id] = state  # cache back into memory
            return state
        except Exception:
            return None
    return None


def train_logic(df, target_col, horizon=30, job_id=None):
    if df is None or df.empty:
        raise ValueError("The uploaded file has no rows to train on.")
    if horizon < 1:
        raise ValueError("Horizon must be at least 1.")

    # --- 1. DATA CLEANING & SORTING ---
    target_col = target_col.strip()
    actual_col = next((c for c in df.columns if c.strip().lower() == target_col.lower()), None)
    if not actual_col:
        available_cols = ", ".join([str(c) for c in df.columns])
        raise ValueError(f"Target '{target_col}' not found. Available columns: {available_cols}")

    # Work on a copy to avoid side effects on caller data
    df = df.copy()

    sanity_warnings = _sales_sanity_warnings(df, actual_col)

    # Clean numeric target
    df[actual_col] = _coerce_numeric_target(df[actual_col])
    outlier_row_numbers = _detect_price_outliers(df, actual_col, zip_col="Zip_Code")
    excluded_outlier_count = 0

    if outlier_row_numbers:
        keep_mask = ~df.index.isin(outlier_row_numbers)
        filtered_df = df.loc[keep_mask].copy()
        # Keep enough rows to train; otherwise retain original data and only report warning.
        if len(filtered_df) >= max(8, int(len(df) * 0.6)):
            excluded_outlier_count = int(len(df) - len(filtered_df))
            df = filtered_df
    
    # Identify and handle Date column for sorting
    date_col = next((c for c in df.columns if 'date' in c.lower()), None)
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df = df.sort_values(by=date_col).reset_index(drop=True)

    df = df.dropna(subset=[actual_col]).reset_index(drop=True)
    if len(df) < 3:
        result = _baseline_forecast(df[actual_col].tolist(), horizon, "Baseline (Insufficient Rows)")
        result["data_quality"]["total_rows"] = len(df)
        return result

    # --- TEMPORAL ANALYSIS (YoY Appreciation & Market Cycle) ---
    yoy_metrics = []
    market_cycle = "Balanced (Insufficient History)"
    temporal_weights = np.ones(len(df))
    
    if date_col:
        yoy_metrics = _calculate_yoy_appreciation(df, actual_col, date_col)
        market_cycle = _calculate_market_cycle(yoy_metrics)
        temporal_weights = _calculate_temporal_weights(df, date_col)

    # --- 2. STRICT FEATURE SANITIZATION (NO LEAKAGE / NO IDS) ---
    # Keep model input restricted to physical/location attributes only.
    y = df[actual_col]

    allowed_features_canonical = {
        "sq_ft_total",
        "bedrooms",
        "bathrooms",
        "zip_code",
        "property_type",
        "condition_score"
    }
    canonical_to_actual = {_canonical_feature_name(c): c for c in df.columns}
    selected_feature_cols = [
        canonical_to_actual[name]
        for name in allowed_features_canonical
        if name in canonical_to_actual
    ]

    leakage_cols = []
    for col in df.columns:
        canonical = _canonical_feature_name(col)
        if canonical in {"list_price", "date_listed"}:
            leakage_cols.append(col)

    id_index_cols = [col for col in df.columns if _is_id_or_index_column(col)]

    if not selected_feature_cols:
        raise ValueError(
            "No allowed model features found. Expected at least one of: "
            "Sq_Ft_Total, Bedrooms, Bathrooms, Zip_Code, Property_Type, Condition_Score"
        )

    X = df[selected_feature_cols].copy()
    
    lead_lag = _compute_lead_lag_analysis(df, y)

    if y.nunique(dropna=True) < 2:
        result = _baseline_forecast(y.tolist(), horizon, "Baseline (Flat Series)")
        result["data_quality"]["total_rows"] = len(y)
        return result

    processed_features = []
    categorical_features = []

    # Explicitly force Zip_Code and Property_Type into one-hot encoding.
    explicit_categorical = {
        next((c for c in X.columns if _canonical_feature_name(c) == "zip_code"), None),
        next((c for c in X.columns if _canonical_feature_name(c) == "property_type"), None)
    }
    explicit_categorical = {c for c in explicit_categorical if c is not None}

    for col in X.columns:
        if col in explicit_categorical:
            X[col] = X[col].astype(str).str.strip().replace("", "UNKNOWN")
            categorical_features.append(col)
        elif pd.api.types.is_object_dtype(X[col]):
            parsed_col, was_numeric_like = _maybe_convert_object_column_to_numeric(X[col])
            if was_numeric_like:
                X[col] = parsed_col
                processed_features.append(col)
            else:
                categorical_features.append(col)
        else:
            processed_features.append(col)

    if categorical_features:
        X_numeric = X[processed_features].copy()
        for cat_col in categorical_features:
            top_categories = X[cat_col].value_counts().head(20).index
            X[cat_col] = X[cat_col].where(X[cat_col].isin(top_categories), "OTHER")
            dummies = pd.get_dummies(X[cat_col], prefix=cat_col, drop_first=False)
            X_numeric = pd.concat([X_numeric, dummies], axis=1)
        X = X_numeric

    processed_features = list(X.columns)

    X_final = X[processed_features].copy()

    # DATA LEAKAGE VETO: absolutely block any List_Price-derived features.
    blocked_leakage_cols = [col for col in X_final.columns if "list_price" in _canonical_feature_name(col)]
    if blocked_leakage_cols:
        X_final = X_final.drop(columns=blocked_leakage_cols)
        processed_features = [col for col in processed_features if col not in blocked_leakage_cols]

    # Force numeric + finite values for all models to avoid repeated bot failures.
    for col in X_final.columns:
        X_final[col] = pd.to_numeric(X_final[col], errors='coerce')
        X_final[col] = X_final[col].replace([np.inf, -np.inf], np.nan)

        finite_values = X_final[col].dropna()
        fill_value = finite_values.median() if not finite_values.empty else 0.0
        if not np.isfinite(fill_value):
            fill_value = 0.0

        X_final[col] = X_final[col].fillna(fill_value)

    X_final = X_final.fillna(0.0)
    
    # --- 3. UPDATED TEMPORAL SPLIT (More Aggressive) ---
    # If dataset is small, use a smaller test size (15%) to keep more for training.
    test_size = 0.15 if len(X_final) < 30 else 0.20
    split_idx = int(len(X_final) * (1 - test_size))

    # Ensure at least 2 rows for testing; otherwise test on training data as last resort.
    if len(X_final) - split_idx < 2:
        X_train_raw, y_train = X_final, y
        X_test_raw, y_test = X_final, y
    else:
        X_train_raw, X_test_raw = X_final.iloc[:split_idx], X_final.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    # --- FEATURE SCALING (fit on train only to prevent test leakage) ---
    scaler = StandardScaler()
    scaler.fit(X_train_raw)
    X_train = pd.DataFrame(scaler.transform(X_train_raw), columns=processed_features, index=X_train_raw.index)
    X_test = pd.DataFrame(scaler.transform(X_test_raw), columns=processed_features, index=X_test_raw.index)
    X_final = pd.DataFrame(scaler.transform(X_final), columns=processed_features, index=X_final.index)

    # --- 4. BATTLE OF THE BOTS ---
    # Build the candidate model dict. Optional models are only added if their
    # library was successfully imported at the top of the file.
    models = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42)
    }

    if xgb is not None:
        models["XGBoost"] = xgb.XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
            random_state=42,
            verbosity=0
        )
    if CatBoostRegressor is not None:
        models["CatBoost"] = CatBoostRegressor(iterations=200, silent=True, random_state=42)
    if lgb is not None:
        models["LightGBM"] = lgb.LGBMRegressor(
            n_estimators=200,
            learning_rate=0.05,
            random_state=42,
            verbose=-1
        )

    best_model, winner_name, best_score = None, "", -np.inf
    best_primary_metric = np.inf
    best_mae, best_rmse, best_mape, best_predictions = 0.0, 0.0, 0.0, []
    model_scores = []
    model_failures = []
    use_time_series_cv = len(X_final) < 30 and len(X_train) >= 8
    cv_strategy = None
    if use_time_series_cv:
        n_splits = min(4, max(2, len(X_train) // 4))
        cv_strategy = TimeSeriesSplit(n_splits=n_splits)

    train_weights = temporal_weights[:split_idx] if len(X_final) - split_idx >= 2 else temporal_weights

    for name, model in models.items():
        try:
            try:
                model.fit(X_train, y_train, sample_weight=train_weights)
            except TypeError:
                model.fit(X_train, y_train)

            score = model.score(X_test, y_test)
            y_pred = model.predict(X_test)
            mae = float(mean_absolute_error(y_test, y_pred))
            rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            mape = _safe_mape(y_test.values, y_pred)
            cv_mape = None

            if cv_strategy is not None:
                cv_mapes = []
                for cv_train_idx, cv_valid_idx in cv_strategy.split(X_train):
                    cv_model = clone(model)
                    cv_model.fit(X_train.iloc[cv_train_idx], y_train.iloc[cv_train_idx])
                    fold_mape = _safe_mape(y_train.iloc[cv_valid_idx].values, cv_model.predict(X_train.iloc[cv_valid_idx]))
                    if np.isfinite(fold_mape):
                        cv_mapes.append(float(fold_mape))
                if cv_mapes:
                    cv_mape = float(np.mean(cv_mapes))

            if not np.isfinite(score):
                score = 0.0
            if not np.isfinite(mape):
                mape = float("inf")

            selection_mape = cv_mape if cv_mape is not None else mape
            model_scores.append({
                "name": name, "r2": float(score), "mae": mae, "rmse": rmse,
                "mape": float(mape), "cv_mape": float(cv_mape) if cv_mape is not None else None
            })

            if (selection_mape < best_primary_metric) or (abs(selection_mape - best_primary_metric) < 0.01 and score > best_score):
                best_primary_metric = selection_mape
                best_score, best_model, winner_name = score, model, name
                best_mae, best_rmse, best_mape, best_predictions = mae, rmse, mape, y_pred
        except Exception as e:
            model_failures.append(f"{name}: {str(e)}")
            print(f"Bot {name} failed: {e}")
            continue

    if best_model:
        best_model.fit(X_final, y)

    if not best_model:
        baseline = _baseline_forecast(y.tolist(), horizon, "Baseline (Model Fallback)")
        baseline["model_failures"] = model_failures
        baseline["data_quality"]["total_rows"] = len(y)
        return baseline

    insights = []
    if shap is not None and len(X_test) > 0:
        try:
            # Sample up to 100 test rows so SHAP represents the model broadly,
            # not just one property.
            shap_sample = X_test.iloc[:min(100, len(X_test))]
            if "Linear" in winner_name and hasattr(shap, "LinearExplainer"):
                explainer = shap.LinearExplainer(best_model, X_train)
            else:
                explainer = shap.Explainer(best_model, X_train)

            shap_values = explainer(shap_sample)

            # Average absolute SHAP across all sampled rows for representative importances
            vals = np.mean(np.abs(shap_values.values), axis=0)
            vals = np.asarray(vals).reshape(-1)
            feature_names = X_test.columns
            insights = [
                {"feature": name, "influence": float(val)}
                for name, val in zip(feature_names, vals)
            ]
            insights = sorted(insights, key=lambda x: abs(x["influence"]), reverse=True)[:5]
        except Exception as e:
            print(f"SHAP Error: {e}")
            insights = []

    history = y.tolist()
    residuals_raw = [float(y_test.iloc[i] - best_predictions[i]) for i in range(len(best_predictions))]
    # Filter NaN residuals before any downstream use — a NaN propagates through std/velocity
    residuals = [r for r in residuals_raw if np.isfinite(r)]
    prediction_std = float(np.std(residuals)) if residuals else 0.0
    
    # --- COMPUTE FEATURE IMPORTANCE ---
    feature_importance = []
    if best_model:
        try:
            if hasattr(best_model, 'feature_importances_'):
                # Tree-based models (Random Forest, XGBoost, LightGBM, CatBoost)
                importances = best_model.feature_importances_
            elif hasattr(best_model, 'coef_'):
                # Linear Regression: normalize absolute coefficients to sum to 1 so they're
                # on the same scale as tree feature_importances_ and comparable across models.
                # Always divide by total (fallback to 1.0 to avoid zero-division or zero array).
                raw = np.abs(best_model.coef_)
                total = raw.sum()
                importances = raw / (total if total > 0 else 1.0)
            else:
                importances = None

            if importances is not None:
                feature_importance = sorted(
                    [{"feature": X_final.columns[i], "importance": float(importances[i])}
                     for i in range(len(importances))],
                    key=lambda x: abs(x["importance"]),
                    reverse=True
                )[:10]
        except Exception:
            pass
    
    # --- COMPUTE CORRELATION MATRIX ---
    correlation_matrix = []
    correlation_lookup = {}
    try:
        # Get top correlations with target
        X_with_target = X_final.copy()
        X_with_target['target'] = y.values
        corr = X_with_target.corr()['target'].drop('target').sort_values(ascending=False)
        correlation_lookup = {str(feature): float(value) for feature, value in corr.items() if pd.notna(value) and np.isfinite(value)}
        correlation_matrix = [
            {"feature": feature, "correlation": float(value)}
            for feature, value in corr.head(10).items()
        ]
    except Exception:
        pass
    
    # --- DATA QUALITY ASSESSMENT ---
    data_quality = {
        "total_rows": len(y),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "split_ratio": f"{int((1 - test_size) * 100)}% / {int(test_size * 100)}%",
        "warnings": sanity_warnings.copy(),
        "outlier_row_numbers": outlier_row_numbers,
        "excluded_outliers": excluded_outlier_count
    }
    
    if len(df) < 30:
        data_quality["warnings"].append("⚠️ Small dataset detected (< 30 rows). Simple models recommended to avoid overfitting.")
    if len(df) < 10:
        data_quality["warnings"].append("⚠️ Very small dataset (< 10 rows). Use baseline models only.")
    if best_rmse > 0 and best_mae / best_rmse < 0.3:
        data_quality["warnings"].append("✓ Low error variance - model is stable")
    if excluded_outlier_count > 0:
        data_quality["warnings"].append(f"Data Health: {excluded_outlier_count} outlier rows were excluded to prevent model skewing.")

    # --- HISTORICAL DATA (Last 30 days) ---
    historical_data = []
    look_back = min(30, len(history))
    for i, val in enumerate(history[-look_back:]):
        historical_data.append({"day": f"Day -{look_back - i}", "val": float(val), "is_historical": True})

    # --- PROJECTION WITH MARKET MOMENTUM + SENTIMENT ---
    projection = []
    if yoy_metrics:
        latest_annual_rate = float(yoy_metrics[-1].get("yoy_appreciation", 0.0)) / 100.0
        market_sentiment_monthly = latest_annual_rate / 12.0
    else:
        market_sentiment_monthly = 0.005

    # Use median feature profile as the forecasting anchor for stability.
    reference_row = X_final.median(axis=0)
    base_anchor_pred = float(best_model.predict(pd.DataFrame([reference_row], columns=X_final.columns))[0])
    
    # Calculate momentum: average % change in recent history
    recent_history = history[-min(10, len(history)):]
    if len(recent_history) >= 2:
        momentum_pct = np.mean([((recent_history[j] - recent_history[j-1]) / (abs(recent_history[j-1]) + 1e-6)) 
                                for j in range(1, len(recent_history))])
    else:
        momentum_pct = 0.0
    
    # Clamp momentum to avoid unstable extrapolation.
    momentum_pct = float(np.clip(momentum_pct, -0.02, 0.02))

    # Compute from observed history only (avoid circular projection feedback).
    sales_velocity = _estimate_sales_velocity(history, best_score, prediction_std, source_df=df)
    
    for i in range(horizon):
        day_number = i + 1
        # Both sentiment and momentum use exponential compounding for consistency.
        # monthly_rate^(days/30) compounds correctly at any horizon.
        sentiment_multiplier = (1.0 + market_sentiment_monthly) ** (day_number / 30.0)
        momentum_multiplier  = (1.0 + momentum_pct)             ** (day_number / 30.0)
        pred = base_anchor_pred * sentiment_multiplier * momentum_multiplier
        
        projection.append({
            "day": f"Day {i + 1}",
            "val": float(pred),
            "is_historical": False
        })

    # Combine historical and forecast data for visualization
    full_chart_data = historical_data + projection
    roi_heatmap = _build_roi_heatmap(X_final, y)
    expected_value = float(y.mean()) if len(y) else 0.0
    selected_property_row = X_final.iloc[[-1]] if len(X_final) else X_final
    price_discovery = _explain_selected_property(best_model, X_train, selected_property_row, expected_value)
    if len(price_discovery) <= 2:
        fallback_base = float(history[-1]) if history else expected_value
        fallback_discovery = _build_price_discovery(fallback_base, projection, feature_importance, correlation_lookup)
        if fallback_discovery:
            price_discovery = fallback_discovery

    # --- ARBITRAGE ANALYSIS: VALUATION DELTA & BUY/RISK SIGNALS ---
    # Calculate AI-predicted prices for all properties in dataset
    arbitrage_analysis = {
        "undervalued_count": 0,
        "overpriced_count": 0,
        "buy_signals": [],  # Top 5 undervalued opportunities
        "risk_signals": [],  # Top 5 overpriced risks
        "valuation_delta_stats": {
            "mean_delta_pct": 0.0,
            "median_delta_pct": 0.0,
            "min_delta_pct": 0.0,
            "max_delta_pct": 0.0
        }
    }
    
    try:
        # Get List_Price from original dataframe if available
        if 'List_Price' in df.columns:
            list_prices = pd.to_numeric(df['List_Price'], errors='coerce')
            
            # Predict fair market value for each row used by the model.
            predicted_prices = best_model.predict(X_final)
            
            # Calculate valuation delta: (AI_predicted - List_Price) / List_Price * 100
            valid_mask = list_prices.notna() & (list_prices > 0)
            deltas_pct = np.full(len(predicted_prices), np.nan)
            raw_deltas = ((predicted_prices[valid_mask] - list_prices[valid_mask]) / list_prices[valid_mask]) * 100
            # Cap at ±500% to prevent bad-data outliers from dominating signal tables
            deltas_pct[valid_mask] = np.clip(raw_deltas, -500.0, 500.0)
            
            # Count signals
            undervalued_mask = deltas_pct > 10  # AI value is >10% higher than asking
            overpriced_mask = deltas_pct < -10  # AI value is >10% lower than asking
            
            arbitrage_analysis["undervalued_count"] = int(np.sum(undervalued_mask))
            arbitrage_analysis["overpriced_count"] = int(np.sum(overpriced_mask))
            
            # Extract top opportunities
            valid_deltas_mask = ~np.isnan(deltas_pct)
            if np.sum(valid_deltas_mask) > 0:
                valid_indices = np.where(valid_deltas_mask)[0]
                valid_deltas = deltas_pct[valid_indices]
                
                # Top 5 undervalued
                if np.sum(undervalued_mask) > 0:
                    undervalued_indices = np.where(undervalued_mask)[0]
                    top_undervalued = sorted(undervalued_indices, key=lambda i: deltas_pct[i], reverse=True)[:5]
                    arbitrage_analysis["buy_signals"] = [
                        {
                            "property_idx": int(idx),
                            "delta_pct": float(deltas_pct[idx]),  # (AI_value - List_Price) / List_Price * 100
                            "list_price": float(list_prices.iloc[idx]) if pd.notna(list_prices.iloc[idx]) else 0,
                            "ai_value": float(predicted_prices[idx]),
                            "potential_gain": float((predicted_prices[idx] - list_prices.iloc[idx]) if pd.notna(list_prices.iloc[idx]) else 0),
                            "alert": "UNDERVALUED / BUY SIGNAL"
                        }
                        for idx in top_undervalued
                    ]
                
                # Top 5 overpriced
                if np.sum(overpriced_mask) > 0:
                    overpriced_indices = np.where(overpriced_mask)[0]
                    top_overpriced = sorted(overpriced_indices, key=lambda i: deltas_pct[i])[:5]
                    arbitrage_analysis["risk_signals"] = [
                        {
                            "property_idx": int(idx),
                            "delta_pct": float(deltas_pct[idx]),  # Negative: AI_value < List_Price
                            "list_price": float(list_prices.iloc[idx]) if pd.notna(list_prices.iloc[idx]) else 0,
                            "ai_value": float(predicted_prices[idx]),
                            "potential_loss": float((list_prices.iloc[idx] - predicted_prices[idx]) if pd.notna(list_prices.iloc[idx]) else 0),
                            "alert": "OVERPRICED / RISK"
                        }
                        for idx in top_overpriced
                    ]
                
                # Compute stats
                arbitrage_analysis["valuation_delta_stats"] = {
                    "mean_delta_pct": float(np.mean(deltas_pct[valid_deltas_mask])),
                    "median_delta_pct": float(np.median(deltas_pct[valid_deltas_mask])),
                    "min_delta_pct": float(np.min(deltas_pct[valid_deltas_mask])),
                    "max_delta_pct": float(np.max(deltas_pct[valid_deltas_mask]))
                }
    except Exception as e:
        print(f"Arbitrage Analysis Error: {e}")
        arbitrage_analysis = {
            "undervalued_count": 0,
            "overpriced_count": 0,
            "buy_signals": [],
            "risk_signals": [],
            "valuation_delta_stats": {"mean_delta_pct": 0.0, "median_delta_pct": 0.0, "min_delta_pct": 0.0, "max_delta_pct": 0.0}
        }

    residual_baseline = float(np.mean(np.abs(y_test))) + 1e-9 if len(y_test) else 1.0
    residual_quality = 1.0 - min(1.0, float(best_mae) / residual_baseline)
    composite_confidence_score = int(round(max(10.0, min(99.0, ((max(0.0, float(best_score)) * 0.72) + (residual_quality * 0.28)) * 100.0))))

    leaderboard = sorted(
        model_scores,
        key=lambda x: (x["cv_mape"] if x.get("cv_mape") is not None else x["mape"], -x["r2"])
    )
    
    # --- MODEL RELIABILITY ASSESSMENT ---
    # Sample size adequacy (for real estate: <30 is low, 30-100 is medium, >100 is high confidence)
    sample_size = len(y)
    if sample_size < 30:
        data_density = "Low Sample Size - Predictions may be unstable. Aim for 50+ transactions."
        confidence_level = "Low"
    elif sample_size < 100:
        data_density = "Medium Sample Size - Acceptable confidence with pattern variability. 100+ transactions recommended."
        confidence_level = "Medium"
    else:
        data_density = f"High Confidence Dataset - {sample_size} transactions provide robust pattern recognition."
        confidence_level = "High"
    
    # Residual analysis: check if residuals look like noise
    residual_stats = {}
    if residuals:
        residual_arr = np.array(residuals)
        residual_stats = {
            "mean": float(np.mean(residual_arr)),
            "std": float(np.std(residual_arr)),
            "min": float(np.min(residual_arr)),
            "max": float(np.max(residual_arr)),
            "q1": float(np.percentile(residual_arr, 25)),
            "median": float(np.percentile(residual_arr, 50)),
            "q3": float(np.percentile(residual_arr, 75))
        }
    
    # Feature engineering summary
    top_feature_names = [str(item.get("feature", "")) for item in feature_importance[:5]]
    sqft_dominant = any("sq_ft_total" in _canonical_feature_name(name) for name in top_feature_names)
    zip_dominant = any("zip_code" in _canonical_feature_name(name) for name in top_feature_names)

    feature_summary = {
        "total_features": len(processed_features),
        # Temporal weighting is applied via sample_weight during training (not as extra features).
        "temporal_features": 1 if date_col else 0,
        "categorical_features_onehot": len([f for f in processed_features if any(c in f for c in ['Property_Type', 'Condition'])]),
        "leakage_removed": sorted(set(["List_Price", "Date_Listed"] + id_index_cols + blocked_leakage_cols)),
        "categorical_encoding": "One-Hot Encoded",
        "allowed_input_features": sorted(selected_feature_cols),
        "dominance_verification": {
            "sq_ft_total_in_top5": sqft_dominant,
            "zip_code_in_top5": zip_dominant,
            "status": "PASS" if (sqft_dominant and zip_dominant) else "CHECK",
            "message": "Sq_Ft_Total and Zip_Code are dominant drivers." if (sqft_dominant and zip_dominant) else "Sq_Ft_Total or Zip_Code are not both in top 5 for this dataset."
        }
    }

    if id_index_cols:
        data_quality["warnings"].append(f"Leakage Prevention: Dropped ID/Index columns from modeling scope: {', '.join(sorted(set(id_index_cols)))}")
    missing_allowed = sorted(allowed_features_canonical - set(_canonical_feature_name(c) for c in selected_feature_cols))
    if missing_allowed:
        data_quality["warnings"].append(
            "Feature Scope Warning: Missing expected attributes in upload: " + ", ".join(missing_allowed)
        )
    
    if job_id is not None:
        state = {
            "model": best_model,
            "scaler": scaler,
            "features": list(processed_features),
        }
        _model_store[job_id] = state
        try:
            import joblib
            joblib.dump(state, _model_path(job_id))
        except Exception:
            pass  # persistence is best-effort; in-memory still works

    return {
        "winner": winner_name,
        "r2_score": float(best_score),
        "mae": best_mae,
        "rmse": best_rmse,
        "mape": best_mape,
        "residuals": residuals,
        "train_size": len(X_train),
        "test_size": len(X_test),
        "split_ratio": data_quality["split_ratio"],
        "leaderboard": leaderboard,
        "model_failures": model_failures,
        "insights": insights,
        "feature_importance": feature_importance,
        "correlation_matrix": correlation_matrix,
        "correlation_lookup": correlation_lookup,
        "prediction_std": prediction_std,
        "composite_confidence_score": composite_confidence_score,
        "stratified_accuracy": composite_confidence_score,
        "primary_metric": "MAPE",
        "ai_precision_label": f"AI Precision: Within {best_mape:.1f}% of Market Truth.",
        "market_sentiment_monthly": market_sentiment_monthly,
        "projection": projection,
        "historical_data": historical_data,
        "full_chart_data": full_chart_data,
        "model_diagnostics": {
            "data_density": data_density,
            "confidence_level": confidence_level,
            "sample_size": sample_size,
            "residual_stats": residual_stats,
            "feature_engineering": feature_summary
        },
        "market_dynamics": {
            "roi_heatmap": roi_heatmap,
            "sales_velocity": sales_velocity,
            "price_discovery": price_discovery,
            "lead_lag": lead_lag,
            "temporal_analysis": {
                "market_cycle": market_cycle,
                "yoy_appreciation_metrics": yoy_metrics,
                "temporal_weighting": "Recent data weighted 10x higher than oldest data (exponential decay)"
            }
        },
        "arbitrage": arbitrage_analysis,
        "data_quality": data_quality
    }