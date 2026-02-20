import pandas as pd
import numpy as np
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostRegressor
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
import joblib
import os

def train_logic(df, target_col, horizon=30):
    if df is None or df.empty:
        raise ValueError("The uploaded file has no rows to train on.")
    if horizon < 1:
        raise ValueError("Horizon must be at least 1.")

    # --- 1. DATA CLEANING & SORTING ---
    target_col = target_col.strip()
    actual_col = next((c for c in df.columns if c.strip().lower() == target_col.lower()), None)
    if not actual_col:
        raise ValueError(f"Target '{target_col}' not found.")

    # Clean numeric target
    if df[actual_col].dtype == 'object':
        df[actual_col] = df[actual_col].str.replace(r'[$,%]', '', regex=True).str.replace(',', '')
    df[actual_col] = pd.to_numeric(df[actual_col], errors='coerce')
    
    # Identify and handle Date column for sorting
    date_col = next((c for c in df.columns if 'date' in c.lower()), None)
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df = df.sort_values(by=date_col).reset_index(drop=True)

    df = df.dropna(subset=[actual_col])

    # --- 2. TIME-SERIES FEATURE ENGINEERING ---
    # Create Lags: This tells the model what happened 1, 2, and 3 steps ago
    df['lag_1'] = df[actual_col].shift(1)
    df['lag_2'] = df[actual_col].shift(2)
    # Rolling Mean: Captures the 'momentum' of the crash
    df['rolling_mean_3'] = df[actual_col].shift(1).rolling(window=3).mean()
    
    # Drop rows where we don't have enough history for lags
    df = df.dropna().reset_index(drop=True)
    if len(df) < 5:
        raise ValueError("Not enough rows after feature engineering. Please upload more data.")

    y = df[actual_col]
    X = df.drop(columns=[actual_col])

    processed_features = []
    for col in X.columns:
        if 'date' in col.lower() or pd.api.types.is_datetime64_any_dtype(X[col]):
            X[col + '_m'] = X[col].dt.month
            X[col + '_d'] = X[col].dt.day
            X[col + '_dayofweek'] = X[col].dt.dayofweek
            processed_features.extend([col + '_m', col + '_d', col + '_dayofweek'])
        elif pd.api.types.is_object_dtype(X[col]):
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            processed_features.append(col)
        else:
            processed_features.append(col)

    X_final = X[processed_features].fillna(0)

    # --- 3. TEMPORAL SPLIT (No Shuffling) ---
    # We take the last 20% of data as the "future" to test on.
    split_idx = int(len(X_final) * 0.8)
    X_train, X_test = X_final.iloc[:split_idx], X_final.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    # --- 4. BATTLE OF THE BOTS ---
    models = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42),
        "XGBoost": xgb.XGBRegressor(n_estimators=200, learning_rate=0.05, random_state=42),
        "CatBoost": CatBoostRegressor(iterations=200, silent=True, random_state=42),
        "LightGBM": lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, random_state=42)
    }

    best_model, winner_name, best_score = None, "", -np.inf
    model_scores = []

    for name, model in models.items():
        try:
            model.fit(X_train, y_train)
            if len(X_test) >= 2:
                score = model.score(X_test, y_test) # R-squared on FUTURE data
            else:
                score = model.score(X_train, y_train)

            if not np.isfinite(score):
                score = model.score(X_train, y_train)
            if not np.isfinite(score):
                continue

            model_scores.append({"name": name, "r2": float(score)})
            if score > best_score:
                best_score, best_model, winner_name = score, model, name
        except Exception:
            continue

    if best_model:
        best_model.fit(X_final, y)
        if not os.path.exists("models"): os.makedirs("models")
        joblib.dump(best_model, "models/best_model.pkl")

    if not best_model:
        raise ValueError("No model could be trained with the provided data.")

    history = y.tolist()
    last_feature_row = X_final.iloc[-1].copy()
    projection = []
    for i in range(horizon):
        step_features = last_feature_row.copy()
        step_features['lag_1'] = history[-1]
        step_features['lag_2'] = history[-2] if len(history) >= 2 else history[-1]
        step_features['rolling_mean_3'] = float(np.mean(history[-3:]))

        pred = float(best_model.predict(pd.DataFrame([step_features]))[0])
        projection.append({"day": f"Day {i + 1}", "val": pred})
        history.append(pred)

    leaderboard = sorted(model_scores, key=lambda x: x["r2"], reverse=True)
    return {
        "winner": winner_name,
        "score": float(best_score),
        "leaderboard": leaderboard,
        "projection": projection
    }