@echo off
title BLUFF! Server

cd /d "E:\Projects\BluffBox\bluff"

echo ========================================
echo           STARTING BLUFF!
echo ========================================
echo.
echo Game: https://bluff.honeyplays.win
echo API:  https://bluff-api.honeyplays.win
echo.
echo Frontend: localhost:5180
echo Backend:  localhost:3010
echo.
echo Press Ctrl+C to stop.
echo ========================================
echo.

REM Start CPU/RAM monitor in separate window
start "BLUFF! Monitor" powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%~dp0Monitor-Bluff.ps1"

REM Start BLUFF frontend + backend
npx concurrently "npm run server" "npm run dev -- --mode production"

pause