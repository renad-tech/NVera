@echo off
rem Starts NVera: backend (port 8000) and frontend (port 5173) in two windows.
rem Double-click this file, or run it from any folder.
rem   start.bat        -> real searches (uses API credits)
rem   start.bat mock   -> free mock mode for UI work

cd /d "%~dp0"

if /i "%1"=="mock" (
    start "NVera backend (MOCK)" cmd /k "set NVERA_MOCK=1&& .venv\Scripts\python -m uvicorn backend.main:app --port 8000"
) else (
    start "NVera backend" cmd /k "set NVERA_MOCK=&& .venv\Scripts\python -m uvicorn backend.main:app --port 8000"
)
start "NVera frontend" cmd /k "npm --prefix frontend run dev"

timeout /t 4 /nobreak >nul
start "" http://localhost:5173
