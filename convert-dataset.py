"""
Convert properties.csv (Indian real estate format) to the schema
required by Estate Vantage:

    Date_Listed | Property_Type | Sq_Ft_Total | Zip_Code |
    Condition_Score | List_Price | Closing_Price | Bedrooms | Bathrooms

Usage:
    python convert-dataset.py <input.csv> <output.csv>
    python convert-dataset.py                              # defaults below
"""

import sys
import random
import pandas as pd
from datetime import datetime, timedelta

INPUT  = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\busca\Desktop\archive\properties.csv"
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\busca\Desktop\archive\properties_converted.csv"

print(f"\n  Reading: {INPUT}")
df = pd.read_csv(INPUT, low_memory=False)
print(f"  Rows: {len(df):,}   Columns: {len(df.columns)}")

# ── 1. Property Type ────────────────────────────────────────────────────────
df["Property_Type"] = df["Type of Property"].astype(str).str.strip()
df["Property_Type"] = df["Property_Type"].replace({
    "nan": "Apartment", "": "Apartment",
})

# ── 2. Sq_Ft_Total — first non-null of the two 'Covered Area' columns ──────
# The CSV has two columns both named "Covered Area"; pandas renames the 2nd to
# "Covered Area.1".  We use whichever is numeric and > 0.
def pick_area(row):
    for col in ["Covered Area", "Covered Area.1", "Carpet Area"]:
        try:
            v = pd.to_numeric(row[col], errors="coerce")
            if pd.notna(v) and v > 0:
                return float(v)
        except KeyError:
            pass
    return None

df["Sq_Ft_Total"] = df.apply(pick_area, axis=1)

# ── 3. Zip_Code — use Area Name (neighbourhood), fall back to City ──────────
df["Zip_Code"] = (
    df["Area Name"].astype(str).str.strip()
    .where(df["Area Name"].astype(str).str.strip().ne("nan"), other=None)
)
df["Zip_Code"] = df["Zip_Code"].fillna(df["City"].astype(str).str.strip())
df["Zip_Code"] = df["Zip_Code"].replace("nan", "Unknown")

# ── 4. Condition_Score (1-10) — derived from furnishing level ───────────────
FURNISH_MAP = {
    "furnished":        9,
    "semi-furnished":   7,
    "semi furnished":   7,
    "unfurnished":      5,
}
def furnish_to_score(val):
    return FURNISH_MAP.get(str(val).strip().lower(), 6)

df["Condition_Score"] = df["furnished Type"].apply(furnish_to_score)

# ── 5. List_Price — the 'Price' column ─────────────────────────────────────
df["List_Price"] = pd.to_numeric(df["Price"], errors="coerce")

# ── 6. Closing_Price — 94-99 % of List_Price (realistic negotiation spread) ─
random.seed(42)
def closing(list_p):
    if pd.isna(list_p):
        return None
    ratio = random.uniform(0.94, 0.99)
    return round(list_p * ratio, -3)   # round to nearest 1000

df["Closing_Price"] = df["List_Price"].apply(closing)

# ── 7. Date_Listed — spread over the past 3 years ──────────────────────────
base      = datetime(2022, 1, 1)
date_range = (datetime.today() - base).days

rng = random.Random(0)
def random_date():
    return (base + timedelta(days=rng.randint(0, date_range))).strftime("%Y-%m-%d")

df["Date_Listed"] = [random_date() for _ in range(len(df))]

# ── 8. Optional extras (kept if present) ────────────────────────────────────
df["Bedrooms"]  = pd.to_numeric(df.get("bedroom"),  errors="coerce")
df["Bathrooms"] = pd.to_numeric(df.get("Bathroom"), errors="coerce")

# ── 9. Drop rows missing critical columns ───────────────────────────────────
required = ["Sq_Ft_Total", "List_Price", "Closing_Price"]
before = len(df)
df = df.dropna(subset=required)
df = df[df["Sq_Ft_Total"] > 0]
df = df[df["List_Price"]   > 0]
df = df[df["Closing_Price"] > 0]
print(f"  Dropped {before - len(df):,} rows with missing critical values.")

# ── 10. Keep only the columns Estate Vantage needs ──────────────────────────
out_cols = [
    "Date_Listed", "Property_Type", "Sq_Ft_Total",
    "Zip_Code", "Condition_Score", "List_Price", "Closing_Price",
    "Bedrooms", "Bathrooms",
]
result = df[out_cols].reset_index(drop=True)

result.to_csv(OUTPUT, index=False)
print(f"\n  Done!  {len(result):,} rows saved to:\n  {OUTPUT}\n")
print("  Column preview:")
print(result.head(3).to_string())
print()
