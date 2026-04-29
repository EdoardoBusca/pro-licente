"""
data.py — File parsing, column mapping, and schema validation.
"""

import io
import os
import random
from datetime import datetime, timedelta

import pandas as pd

# ─── Constants ─────────────────────────────────────────────────────────────────

SCHEMA_VALID_RATIO = float(os.getenv("SCHEMA_VALID_RATIO", "0.90"))

MANDATORY_COLUMNS = [
    "Date_Listed",
    "Property_Type",
    "Sq_Ft_Total",
    "Zip_Code",
    "Condition_Score",
    "List_Price",
    "Closing_Price",
]

ALLOWED_FILE_TYPES = {".csv", ".xlsx", ".xls", ".txt"}

# ─── File Reading ──────────────────────────────────────────────────────────────

def read_uploaded_file(contents: bytes, filename: str) -> pd.DataFrame:
    """Parse uploaded CSV or Excel bytes into a DataFrame."""
    file_ext = os.path.splitext((filename or "").lower())[1]

    csv_attempts = [
        {"sep": None, "engine": "python", "encoding_errors": "replace"},
        {"sep": ",",  "engine": "python", "encoding_errors": "replace"},
        {"sep": ";",  "engine": "python", "encoding_errors": "replace"},
        {"sep": "\t", "engine": "python", "encoding_errors": "replace"},
        {"sep": "|",  "engine": "python", "encoding_errors": "replace"},
    ]

    csv_errors = []
    try_csv_first = file_ext in {".csv", ".txt", ""}

    if try_csv_first:
        for kwargs in csv_attempts:
            try:
                df = pd.read_csv(io.BytesIO(contents), **kwargs)
                if df is not None and len(df.columns) > 0:
                    return df
            except Exception as exc:
                csv_errors.append(str(exc))

    try:
        return pd.read_excel(io.BytesIO(contents))
    except Exception as excel_exc:
        if not try_csv_first:
            for kwargs in csv_attempts:
                try:
                    df = pd.read_csv(io.BytesIO(contents), **kwargs)
                    if df is not None and len(df.columns) > 0:
                        return df
                except Exception as exc:
                    csv_errors.append(str(exc))

        error_parts = []
        if csv_errors:
            error_parts.append(f"CSV parsing failed ({csv_errors[-1]})")
        error_parts.append(f"Excel parsing failed ({excel_exc})")
        raise ValueError(f"Could not read uploaded file. {'; '.join(error_parts)}")


# ─── Column Mapping ────────────────────────────────────────────────────────────

_NUMERIC_TRANSFORMS = {
    "sqm_to_sqft":        lambda x: x * 10.764,
    "sqft_to_sqm":        lambda x: x / 10.764,
    "sqyd_to_sqft":       lambda x: x * 9.0,
    "acres_to_sqft":      lambda x: x * 43560.0,
    "inr_to_usd":         lambda x: x / 83.0,
    "lakh_to_usd":        lambda x: x * 1200.0,
    "crore_to_usd":       lambda x: x * 120000.0,
    "thousands_to_units": lambda x: x * 1000.0,
}

_FURNISH_SCORE = {
    "furnished": 9, "fully furnished": 9,
    "semi-furnished": 7, "semi furnished": 7, "semifurnished": 7,
    "unfurnished": 5, "bare shell": 4,
}


def apply_column_mapping(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """Rename columns and apply unit/currency transforms from AI-generated mapping."""
    result = df.copy()
    for target_col, info in mapping.items():
        source    = (info or {}).get("source")
        transform = (info or {}).get("transform")
        if not source or source not in df.columns:
            continue
        raw = df[source]
        if transform in _NUMERIC_TRANSFORMS:
            result[target_col] = pd.to_numeric(raw, errors="coerce").apply(_NUMERIC_TRANSFORMS[transform])
        elif transform == "derive_condition_from_furnishing":
            result[target_col] = (
                raw.astype(str).str.lower().str.strip()
                .map(lambda v: _FURNISH_SCORE.get(v, 6))
            )
        else:
            result[target_col] = raw
    return result


# ─── Schema Validation & Auto-Fix ─────────────────────────────────────────────

def validate_schema(df: pd.DataFrame, target: str):
    """
    Raise ValueError if mandatory columns are missing or target is wrong.
    Auto-fixes bad Date_Listed, Closing_Price, Condition_Score, Sq_Ft_Total,
    and List_Price values in-place rather than rejecting the upload.
    """
    missing = [col for col in MANDATORY_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(
            f"Data Schema Mismatch: Missing mandatory columns: {', '.join(missing)}. "
            f"Expected schema: {', '.join(MANDATORY_COLUMNS)}."
        )

    if str(target).strip().lower() != "closing_price":
        raise ValueError(
            "Data Schema Mismatch: Target Variable must be 'Closing_Price' for Real Estate Sales mode."
        )

    _fix_date_listed(df)
    _fix_closing_price(df)
    _fix_condition_score(df)
    _fix_sq_ft_total(df)
    _fix_list_price(df)


def _fix_date_listed(df: pd.DataFrame):
    parsed = pd.to_datetime(df["Date_Listed"], errors="coerce")
    if float(parsed.notna().mean()) < SCHEMA_VALID_RATIO:
        base = datetime(2022, 1, 1)
        span = (datetime.today() - base).days
        rng  = random.Random(42)
        df["Date_Listed"] = [
            (base + timedelta(days=rng.randint(0, span))).strftime("%Y-%m-%d")
            for _ in range(len(df))
        ]


def _fix_closing_price(df: pd.DataFrame):
    numeric = pd.to_numeric(df["Closing_Price"], errors="coerce")
    valid_ratio = float(((numeric.notna()) & (numeric > 0)).mean()) if len(numeric) else 0.0
    if valid_ratio < SCHEMA_VALID_RATIO:
        rng = random.Random(0)
        list_prices = pd.to_numeric(df["List_Price"], errors="coerce")
        df["Closing_Price"] = list_prices.apply(
            lambda p: round(p * rng.uniform(0.94, 0.99), -3) if pd.notna(p) and p > 0 else None
        )


def _fix_condition_score(df: pd.DataFrame):
    numeric = pd.to_numeric(df["Condition_Score"], errors="coerce")
    valid = (numeric.notna()) & (numeric >= 1) & (numeric <= 10)
    if float(valid.mean()) < SCHEMA_VALID_RATIO:
        rescaled = (numeric / 10.0).clip(1, 10)
        still_valid = (rescaled.notna()) & (rescaled >= 1) & (rescaled <= 10)
        if float(still_valid.mean()) >= SCHEMA_VALID_RATIO:
            df["Condition_Score"] = rescaled.round(1)
        else:
            df["Condition_Score"] = numeric.fillna(6).clip(1, 10)


def _fix_sq_ft_total(df: pd.DataFrame):
    numeric = pd.to_numeric(df["Sq_Ft_Total"], errors="coerce")
    df["Sq_Ft_Total"] = 1000.0 if numeric.isna().all() else numeric.fillna(numeric.median())


def _fix_list_price(df: pd.DataFrame):
    numeric = pd.to_numeric(df["List_Price"], errors="coerce")
    df["List_Price"] = 0.0 if numeric.isna().all() else numeric.fillna(numeric.median())

    closing = pd.to_numeric(df["Closing_Price"], errors="coerce")
    df["Closing_Price"] = df["List_Price"] if closing.isna().all() else closing.fillna(df["List_Price"])
