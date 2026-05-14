@echo off
title ContentCrafterzz Outreach OS
echo Starting ContentCrafterzz Outreach OS...
echo.

cd /d C:\Users\it\contentcrafterzz-outreach-os

:: Start or restart via PM2 (auto-restarts on crash)
pm2 start ecosystem.config.js 2>nul || pm2 restart all

timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo  App:      http://localhost:5173
echo  Analyzer: http://localhost:5173/analyzer
echo  API:      http://localhost:3001/api
echo.
echo  pm2 list     - check status
echo  pm2 logs     - view logs
echo  pm2 stop all - stop servers
echo ============================================
echo.
echo Servers managed by PM2 - auto-restart on crash.
echo This window can be closed safely.
echo.
start http://localhost:5173
pause
