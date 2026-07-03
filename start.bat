@echo off
chcp 65001 >nul

echo.
echo ========================================
echo   Werewolf Game - Quick Start
echo ========================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js not found
    pause
    exit /b 1
)

echo Node.js found

echo.
echo Starting backend...
start cmd /k "cd backend && npm install && npm run dev"

timeout /t 3 /nobreak

echo.
echo Starting frontend...
start cmd /k "cd frontend && npm install && npm run dev"

echo.
echo ========================================
echo Started!
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3000
echo.
pause
