@echo off
title Estate Vantage — Dataset Converter
cd /d "%~dp0"

echo.
echo  ==========================================
echo   Estate Vantage — Dataset Converter
echo  ==========================================
echo.
echo  Input:  C:\Users\busca\Desktop\archive\properties.csv
echo  Output: C:\Users\busca\Desktop\archive\properties_converted.csv
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found.
    pause
    exit /b 1
)

pip install pandas --quiet

python convert-dataset.py

echo.
echo  Upload properties_converted.csv to Estate Vantage.
echo.
pause
