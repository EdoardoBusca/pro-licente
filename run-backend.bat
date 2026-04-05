@echo off
title Estate Vantage - Backend
cd /d "%~dp0backend"

echo.
echo  ==========================================
echo   Estate Vantage - Backend (FastAPI)
echo   http://localhost:8000
echo  ==========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Make sure Python is installed and on your PATH.
    pause
    exit /b 1
)

echo  Installing / verifying dependencies...
echo  (this can take a few minutes the first time - you will see progress below)
echo.
pip uninstall google-generativeai
pip install --no-cache-dir -r requirements.txt

echo.
echo  Starting server...
echo.

python -m uvicorn main:app --reload --port 8000 --host 0.0.0.0

pause
