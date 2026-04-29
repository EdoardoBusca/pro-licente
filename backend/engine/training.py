"""
training.py — Main ML training pipeline (train_logic).

Pipeline:
  1. Data cleaning   — coerce types, remove outliers, sort by date
  2. Feature prep    — whitelist features, one-hot encode categories, scale
  3. Train/test split — temporal (chronological) 80/20 or 85/15
  4. Battle of Bots  — Linear Regression, Random Forest, XGBoost, CatBoost, LightGBM
  5. Projection      — median-anchor forecast with market sentiment + momentum
  6. Analytics       — SHAP importance, ROI heatmap, arbitrage, velocity, discovery
"""

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler

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

from .analytics import (
    baseline_forecast, build_price_discovery, build_roi_heatmap,
    compute_arbitrage, detect_price_outliers, estimate_sales_velocity,
    explain_property, sales_sanity_warnings,
)
from .market import (
    compute_lead_lag, compute_market_cycle, compute_temporal_weights,
    compute_yoy_appreciation,
)
from .model_store import save_model_state
from .utils import canonical_name, coerce_numeric, is_id_column, maybe_numeric, safe_mape


def train_logic(df: pd.DataFrame, target_col: str, horizon: int = 30, job_id: str = None) -> dict:
    if df is None or df.empty:
        raise ValueError("The uploaded file has no rows to train on.")
    if horizon < 1:
        raise ValueError("Horizon must be at least 1.")

    # ── 1. DATA CLEANING ────────────────────────────────────────────────────────
    target_col = target_col.strip()
    actual_col = next((c for c in df.columns if c.strip().lower() == target_col.lower()), None)
    if not actual_col:
        raise ValueError(f"Target '{target_col}' not found. Available: {', '.join(df.columns)}")

    df = df.copy()
    sanity_warnings = sales_sanity_warnings(df, actual_col)

    df[actual_col]     = coerce_numeric(df[actual_col])
    outlier_rows       = detect_price_outliers(df, actual_col, zip_col="Zip_Code")
    excluded_count     = 0

    if outlier_rows:
        filtered = df.loc[~df.index.isin(outlier_rows)].copy()
        if len(filtered) >= max(8, int(len(df) * 0.6)):
            excluded_count = len(df) - len(filtered)
            df = filtered

    date_col = next((c for c in df.columns if "date" in c.lower()), None)
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df = df.sort_values(by=date_col).reset_index(drop=True)

    df = df.dropna(subset=[actual_col]).reset_index(drop=True)
    if len(df) < 3:
        result = baseline_forecast(df[actual_col].tolist(), horizon, "Baseline (Insufficient Rows)")
        result["data_quality"]["total_rows"] = len(df)
        return result

    # ── TEMPORAL ANALYSIS ───────────────────────────────────────────────────────
    y                = df[actual_col]
    yoy_metrics      = compute_yoy_appreciation(df, actual_col, date_col) if date_col else []
    market_cycle     = compute_market_cycle(yoy_metrics)
    temporal_weights = compute_temporal_weights(df, date_col) if date_col else np.ones(len(df))
    lead_lag         = compute_lead_lag(df, y)

    # ── 2. FEATURE PREPARATION ──────────────────────────────────────────────────
    ALLOWED = {"sq_ft_total", "bedrooms", "bathrooms", "zip_code", "property_type", "condition_score"}
    canonical_to_actual = {canonical_name(c): c for c in df.columns}
    feature_cols = [canonical_to_actual[n] for n in ALLOWED if n in canonical_to_actual]

    if not feature_cols:
        raise ValueError(
            "No allowed model features found. Expected at least one of: "
            "Sq_Ft_Total, Bedrooms, Bathrooms, Zip_Code, Property_Type, Condition_Score"
        )

    leakage_cols  = [c for c in df.columns if canonical_name(c) in {"list_price", "date_listed"}]
    id_index_cols = [c for c in df.columns if is_id_column(c)]

    if y.nunique(dropna=True) < 2:
        result = baseline_forecast(y.tolist(), horizon, "Baseline (Flat Series)")
        result["data_quality"]["total_rows"] = len(y)
        return result

    X = df[feature_cols].copy()

    explicit_cat = {
        next((c for c in X.columns if canonical_name(c) == "zip_code"), None),
        next((c for c in X.columns if canonical_name(c) == "property_type"), None),
    } - {None}

    numeric_feats, cat_feats = [], []
    for col in X.columns:
        if col in explicit_cat:
            X[col] = X[col].astype(str).str.strip().replace("", "UNKNOWN")
            cat_feats.append(col)
        elif pd.api.types.is_object_dtype(X[col]):
            parsed, was_numeric = maybe_numeric(X[col])
            if was_numeric:
                X[col] = parsed
                numeric_feats.append(col)
            else:
                cat_feats.append(col)
        else:
            numeric_feats.append(col)

    if cat_feats:
        X_num = X[numeric_feats].copy()
        for cat in cat_feats:
            top_cats = X[cat].value_counts().head(20).index
            X[cat]   = X[cat].where(X[cat].isin(top_cats), "OTHER")
            X_num    = pd.concat([X_num, pd.get_dummies(X[cat], prefix=cat, drop_first=False)], axis=1)
        X = X_num

    processed = list(X.columns)

    # Remove any remaining List_Price-derived columns
    blocked = [c for c in X.columns if "list_price" in canonical_name(c)]
    if blocked:
        X        = X.drop(columns=blocked)
        processed = [c for c in processed if c not in blocked]

    # Force numeric + fill NaN
    for col in X.columns:
        X[col] = pd.to_numeric(X[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
        fill   = X[col].dropna().median()
        X[col] = X[col].fillna(fill if np.isfinite(fill) else 0.0)
    X = X.fillna(0.0)

    # ── 3. TRAIN/TEST SPLIT & SCALING ──────────────────────────────────────────
    test_size = 0.15 if len(X) < 30 else 0.20
    split_idx = int(len(X) * (1 - test_size))

    if len(X) - split_idx < 2:
        X_train_raw, y_train = X, y
        X_test_raw,  y_test  = X, y
    else:
        X_train_raw, X_test_raw = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train,     y_test     = y.iloc[:split_idx], y.iloc[split_idx:]

    scaler  = StandardScaler()
    scaler.fit(X_train_raw)
    X_train = pd.DataFrame(scaler.transform(X_train_raw), columns=processed, index=X_train_raw.index)
    X_test  = pd.DataFrame(scaler.transform(X_test_raw),  columns=processed, index=X_test_raw.index)
    X_all   = pd.DataFrame(scaler.transform(X),           columns=processed, index=X.index)

    # ── 4. BATTLE OF THE BOTS ──────────────────────────────────────────────────
    candidates = {
        "Linear Regression": LinearRegression(),
        "Random Forest":     RandomForestRegressor(n_estimators=100, random_state=42),
    }
    if xgb is not None:
        candidates["XGBoost"] = xgb.XGBRegressor(n_estimators=200, learning_rate=0.05, random_state=42, verbosity=0)
    if CatBoostRegressor is not None:
        candidates["CatBoost"] = CatBoostRegressor(iterations=200, silent=True, random_state=42)
    if lgb is not None:
        candidates["LightGBM"] = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, random_state=42, verbose=-1)

    use_cv = len(X_all) < 30 and len(X_train) >= 8
    cv     = TimeSeriesSplit(n_splits=min(4, max(2, len(X_train) // 4))) if use_cv else None

    train_weights = temporal_weights[:split_idx] if len(X_all) - split_idx >= 2 else temporal_weights

    best_model, winner_name = None, ""
    best_primary = np.inf
    best_score   = -np.inf
    best_mae = best_rmse = best_mape = 0.0
    best_predictions = []
    model_scores, model_failures = [], []

    for name, model in candidates.items():
        try:
            try:
                model.fit(X_train, y_train, sample_weight=train_weights)
            except TypeError:
                model.fit(X_train, y_train)

            score  = model.score(X_test, y_test)
            y_pred = model.predict(X_test)
            mae    = float(mean_absolute_error(y_test, y_pred))
            rmse   = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            mape   = _safe_mape_finite(y_test.values, y_pred)
            cv_mape = _cross_validate_mape(model, X_train, y_train, cv) if cv else None

            score = score if np.isfinite(score) else 0.0
            mape  = mape  if np.isfinite(mape)  else float("inf")

            sel_mape = cv_mape if cv_mape is not None else mape
            model_scores.append({
                "name": name, "r2": float(score), "mae": mae, "rmse": rmse,
                "mape": float(mape), "cv_mape": float(cv_mape) if cv_mape is not None else None,
            })

            if sel_mape < best_primary or (abs(sel_mape - best_primary) < 0.01 and score > best_score):
                best_primary    = sel_mape
                best_score      = score
                best_model      = model
                winner_name     = name
                best_mae, best_rmse, best_mape, best_predictions = mae, rmse, mape, y_pred
        except Exception as e:
            model_failures.append(f"{name}: {e}")

    if not best_model:
        result = baseline_forecast(y.tolist(), horizon, "Baseline (Model Fallback)")
        result["model_failures"] = model_failures
        result["data_quality"]["total_rows"] = len(y)
        return result

    best_model.fit(X_all, y)

    # ── 5. SHAP FEATURE IMPORTANCE ──────────────────────────────────────────────
    insights = []
    if shap is not None and len(X_test) > 0:
        try:
            sample = X_test.iloc[:min(100, len(X_test))]
            explainer = (shap.LinearExplainer(best_model, X_train)
                         if "Linear" in winner_name and hasattr(shap, "LinearExplainer")
                         else shap.Explainer(best_model, X_train))
            vals = np.mean(np.abs(explainer(sample).values), axis=0).reshape(-1)
            insights = sorted(
                [{"feature": str(f), "influence": float(v)} for f, v in zip(X_test.columns, vals)],
                key=lambda x: abs(x["influence"]), reverse=True,
            )[:5]
        except Exception as e:
            print(f"SHAP error: {e}")

    # ── FEATURE IMPORTANCE (tree or linear) ─────────────────────────────────────
    feature_importance = []
    try:
        if hasattr(best_model, "feature_importances_"):
            imps = best_model.feature_importances_
        elif hasattr(best_model, "coef_"):
            raw  = np.abs(best_model.coef_)
            imps = raw / (raw.sum() or 1.0)
        else:
            imps = None
        if imps is not None:
            feature_importance = sorted(
                [{"feature": X_all.columns[i], "importance": float(imps[i])} for i in range(len(imps))],
                key=lambda x: abs(x["importance"]), reverse=True,
            )[:10]
    except Exception:
        pass

    # ── CORRELATION MATRIX ──────────────────────────────────────────────────────
    correlation_lookup = {}
    correlation_matrix = []
    try:
        X_with_target = X_all.copy()
        X_with_target["target"] = y.values
        corr = X_with_target.corr()["target"].drop("target").sort_values(ascending=False)
        correlation_lookup = {str(f): float(v) for f, v in corr.items() if pd.notna(v) and np.isfinite(v)}
        correlation_matrix = [{"feature": f, "correlation": float(v)} for f, v in corr.head(10).items()]
    except Exception:
        pass

    # ── 6. ANALYTICS ────────────────────────────────────────────────────────────
    history        = y.tolist()
    residuals_raw  = [float(y_test.iloc[i] - best_predictions[i]) for i in range(len(best_predictions))]
    residuals      = [r for r in residuals_raw if np.isfinite(r)]
    prediction_std = float(np.std(residuals)) if residuals else 0.0

    roi_heatmap      = build_roi_heatmap(X_all, y)
    expected_value   = float(y.mean()) if len(y) else 0.0
    selected_row     = X_all.iloc[[-1]] if len(X_all) else X_all
    price_discovery  = explain_property(best_model, X_train, selected_row, expected_value)
    if len(price_discovery) <= 2:
        fallback = build_price_discovery(float(history[-1]) if history else expected_value,
                                         [], feature_importance, correlation_lookup)
        if fallback:
            price_discovery = fallback

    arbitrage     = compute_arbitrage(df, best_model, X_all)
    sales_velocity = estimate_sales_velocity(history, best_score, prediction_std, source_df=df)

    # ── PROJECTION ──────────────────────────────────────────────────────────────
    market_sentiment = (float(yoy_metrics[-1].get("yoy_appreciation", 0.0)) / 100.0 / 12.0
                        if yoy_metrics else 0.005)
    recent_hist      = history[-min(10, len(history)):]
    momentum_pct     = float(np.clip(
        np.mean([((recent_hist[j] - recent_hist[j-1]) / (abs(recent_hist[j-1]) + 1e-6))
                 for j in range(1, len(recent_hist))]) if len(recent_hist) >= 2 else 0.0,
        -0.02, 0.02,
    ))
    anchor = float(best_model.predict(pd.DataFrame([X_all.median(axis=0)], columns=X_all.columns))[0])

    look_back       = min(30, len(history))
    historical_data = [
        {"day": f"Day -{look_back - i}", "val": float(v), "is_historical": True}
        for i, v in enumerate(history[-look_back:])
    ]
    projection = [
        {
            "day":           f"Day {i + 1}",
            "val":           float(anchor * (1 + market_sentiment) ** ((i + 1) / 30.0)
                                        * (1 + momentum_pct)    ** ((i + 1) / 30.0)),
            "is_historical": False,
        }
        for i in range(horizon)
    ]

    # ── DATA QUALITY & MODEL DIAGNOSTICS ────────────────────────────────────────
    data_quality = {
        "total_rows":         len(y),
        "train_rows":         len(X_train),
        "test_rows":          len(X_test),
        "split_ratio":        f"{int((1 - test_size) * 100)}% / {int(test_size * 100)}%",
        "warnings":           sanity_warnings.copy(),
        "outlier_row_numbers": outlier_rows,
        "excluded_outliers":  excluded_count,
    }
    if len(df) < 30:
        data_quality["warnings"].append("⚠️ Small dataset (< 30 rows). Predictions may be unstable.")
    if len(df) < 10:
        data_quality["warnings"].append("⚠️ Very small dataset (< 10 rows). Use baseline models only.")
    if best_rmse > 0 and best_mae / best_rmse < 0.3:
        data_quality["warnings"].append("✓ Low error variance - model is stable")
    if excluded_count > 0:
        data_quality["warnings"].append(f"Data Health: {excluded_count} outlier rows excluded.")
    if id_index_cols:
        data_quality["warnings"].append(f"Leakage Prevention: Dropped ID columns: {', '.join(sorted(set(id_index_cols)))}")

    missing_allowed = sorted(ALLOWED - {canonical_name(c) for c in feature_cols})
    if missing_allowed:
        data_quality["warnings"].append("Feature Scope Warning: Missing expected attributes: " + ", ".join(missing_allowed))

    n = len(y)
    if n < 30:
        density, confidence = "Low Sample Size - Aim for 50+ transactions.", "Low"
    elif n < 100:
        density, confidence = "Medium Sample Size - 100+ transactions recommended.", "Medium"
    else:
        density, confidence = f"High Confidence Dataset - {n} transactions.", "High"

    residual_stats = {}
    if residuals:
        arr = np.array(residuals)
        residual_stats = {
            "mean": float(np.mean(arr)), "std": float(np.std(arr)),
            "min":  float(np.min(arr)),  "max": float(np.max(arr)),
            "q1":   float(np.percentile(arr, 25)), "median": float(np.percentile(arr, 50)),
            "q3":   float(np.percentile(arr, 75)),
        }

    top5 = [str(f.get("feature", "")) for f in feature_importance[:5]]
    sqft_dominant = any("sq_ft_total" in canonical_name(n) for n in top5)
    zip_dominant  = any("zip_code"    in canonical_name(n) for n in top5)

    residual_baseline    = float(np.mean(np.abs(y_test))) + 1e-9 if len(y_test) else 1.0
    residual_quality     = 1.0 - min(1.0, float(best_mae) / residual_baseline)
    composite_confidence = int(round(max(10.0, min(99.0,
        ((max(0.0, float(best_score)) * 0.72) + (residual_quality * 0.28)) * 100.0
    ))))

    if job_id is not None:
        save_model_state(job_id, {"model": best_model, "scaler": scaler, "features": processed})

    return {
        "winner":    winner_name,
        "r2_score":  float(best_score),
        "mae":       best_mae,
        "rmse":      best_rmse,
        "mape":      best_mape,
        "residuals": residuals,
        "train_size":  len(X_train),
        "test_size":   len(X_test),
        "split_ratio": data_quality["split_ratio"],
        "leaderboard": sorted(model_scores, key=lambda x: (x["cv_mape"] if x.get("cv_mape") is not None else x["mape"], -x["r2"])),
        "model_failures": model_failures,
        "insights":            insights,
        "feature_importance":  feature_importance,
        "correlation_matrix":  correlation_matrix,
        "correlation_lookup":  correlation_lookup,
        "prediction_std":      prediction_std,
        "composite_confidence_score": composite_confidence,
        "stratified_accuracy":        composite_confidence,
        "primary_metric":    "MAPE",
        "ai_precision_label": f"AI Precision: Within {best_mape:.1f}% of Market Truth.",
        "market_sentiment_monthly": market_sentiment,
        "projection":      projection,
        "historical_data": historical_data,
        "full_chart_data": historical_data + projection,
        "model_diagnostics": {
            "data_density":    density,
            "confidence_level": confidence,
            "sample_size":     n,
            "residual_stats":  residual_stats,
            "feature_engineering": {
                "total_features":              len(processed),
                "temporal_features":           1 if date_col else 0,
                "categorical_features_onehot": len([f for f in processed if any(c in f for c in ["Property_Type", "Condition"])]),
                "leakage_removed":             sorted(set(["List_Price", "Date_Listed"] + id_index_cols + blocked)),
                "categorical_encoding":        "One-Hot Encoded",
                "allowed_input_features":      sorted(feature_cols),
                "dominance_verification": {
                    "sq_ft_total_in_top5": sqft_dominant,
                    "zip_code_in_top5":    zip_dominant,
                    "status":  "PASS" if (sqft_dominant and zip_dominant) else "CHECK",
                    "message": "Sq_Ft_Total and Zip_Code are dominant drivers." if (sqft_dominant and zip_dominant)
                               else "Sq_Ft_Total or Zip_Code are not both in top 5 for this dataset.",
                },
            },
        },
        "market_dynamics": {
            "roi_heatmap":    roi_heatmap,
            "sales_velocity": sales_velocity,
            "price_discovery": price_discovery,
            "lead_lag":       lead_lag,
            "temporal_analysis": {
                "market_cycle":             market_cycle,
                "yoy_appreciation_metrics": yoy_metrics,
                "temporal_weighting":       "Recent data weighted 10x higher (exponential decay)",
            },
        },
        "arbitrage":   arbitrage,
        "data_quality": data_quality,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_mape_finite(y_true, y_pred) -> float:
    return safe_mape(y_true, y_pred)


def _cross_validate_mape(model, X_train, y_train, cv) -> float | None:
    mapes = []
    for train_idx, valid_idx in cv.split(X_train):
        m = clone(model)
        m.fit(X_train.iloc[train_idx], y_train.iloc[train_idx])
        fold = safe_mape(y_train.iloc[valid_idx].values, m.predict(X_train.iloc[valid_idx]))
        if np.isfinite(fold):
            mapes.append(float(fold))
    return float(np.mean(mapes)) if mapes else None
