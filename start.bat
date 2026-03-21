@echo off
chcp 65001 >nul

start "Backend" cmd /k "cd /d %~dp0backend && D:\Developtools\miniconda3\Scripts\activate p311 && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

exit
