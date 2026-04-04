@echo off
title Estate Vantage — Frontend
cd /d "%~dp0frontend"

echo.
echo  ==========================================
echo   Estate Vantage — Frontend (Next.js)
echo   http://localhost:3000
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Make sure Node.js is installed and on your PATH.
    pause
    exit /b 1
)

if not exist node_modules (
    echo  Installing dependencies...
    npm install
    echo.
)

echo  Starting dev server...
echo.

npm run dev

pause
