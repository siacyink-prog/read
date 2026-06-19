@echo off
REM ============================================================
REM  Local start: install deps + run + open browser
REM  Just double-click to run.
REM ============================================================
setlocal
cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install v18+ from https://nodejs.org
  pause
  exit /b 1
)

if not exist ".env" (
  echo [SETUP] No .env yet, copying from .env.example ...
  copy ".env.example" ".env" >nul
  echo [IMPORTANT] Fill in your password and API key in .env, then run this again.
  notepad .env
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo [INSTALL] First run, running npm install (may take a minute) ...
  call npm install
  if errorlevel 1 (
    echo [FAILED] npm install error. Please share the message above.
    pause
    exit /b 1
  )
)

echo [START] Starting server, browser will open shortly ...
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

REM Keep this window open - closing it stops the server.
call npm start

pause
endlocal
