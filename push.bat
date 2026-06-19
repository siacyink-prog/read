@echo off
REM ============================================================
REM  Push to GitHub: https://github.com/siacyink-prog/read
REM  Just double-click to run.
REM ============================================================
setlocal
cd /d "%~dp0"

set "REMOTE=https://github.com/siacyink-prog/read.git"

git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git not found. Install from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo [INIT] First run, initializing repo...
  git init
  git branch -M main
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTE%"
) else (
  git remote set-url origin "%REMOTE%"
)

REM Build an ASCII timestamp via PowerShell (avoids locale encoding issues)
set "STAMP="
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%i"
if "%STAMP%"=="" set "STAMP=manual"

echo [ADD] git add .
git add .

echo [COMMIT] update %STAMP%
git commit -m "update %STAMP%"

echo [PUSH] git push -u origin main
git push -u origin main
if errorlevel 1 (
  echo.
  echo [FAILED] Push did not succeed. Common causes:
  echo   1^) Not logged in to GitHub - a login window pops up on first push
  echo   2^) Remote already has commits - try:
  echo      git pull origin main --allow-unrelated-histories
  echo.
) else (
  echo.
  echo [DONE] Pushed to %REMOTE%
)

echo.
pause
endlocal
