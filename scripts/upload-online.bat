@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

echo.
echo ============================================================
echo   First Click - Upload local changes to online
echo ============================================================
echo.
echo  Test first: http://localhost:5173
echo.
echo  What to upload?
echo.
echo    [1] All code changes (recommended)
echo        screens, menus, API, migrations, i18n, CSS...
echo        (does NOT replace production invoices/customers)
echo.
echo    [2] Full copy = code + entire local database
echo        (REPLACES online data - use with care)
echo.
echo    [Q] Cancel
echo.

if "%~1"=="1" goto mode_code
if "%~1"=="2" goto mode_full
if "%~1"=="code" goto mode_code
if "%~1"=="full" goto mode_full

set /p "CHOICE=Choose 1 or 2: "
if /i "!CHOICE!"=="2" goto mode_full
if /i "!CHOICE!"=="Q" exit /b 0
if not "!CHOICE!"=="1" (
  echo Invalid choice.
  pause
  exit /b 1
)

:mode_code
echo.
echo ========== Your PC: push code to GitHub ==========
git status --short
echo.
set /p "DOCOMMIT=Push to GitHub? (Y/N): "
if /i not "!DOCOMMIT!"=="Y" goto server_instructions

set /p "MSG=Commit message (Enter = default): "
if "!MSG!"=="" set "MSG=release: sync tested changes from local"

git add -A
git reset HEAD backend/.env frontend/.env.local 2>nul
git reset HEAD backend/storage/logs 2>nul
git commit -m "!MSG!"
if errorlevel 1 (
  echo No new changes to commit - save your files first.
) else (
  git push origin main
  if errorlevel 1 (
    echo ERROR: git push failed
    pause
    exit /b 1
  )
  echo OK: code is on GitHub
)

if exist "scripts\sync-data\reference_first-company.json" (
  echo.
  echo --- Reference data (currencies, branches, cost centers) ---
  call scripts\push-reference-to-github.bat first-company
)

:server_instructions
echo.
echo ============================================================
echo   SERVER - Hostinger Terminal - ONE command only:
echo ============================================================
echo.
echo   bash /var/www/erp/deploy/publish-online.sh
echo.
echo ============================================================
echo   Then in browser: Ctrl+Shift+R
echo   Check: https://firstclickerp.top/deploy-revision.txt
echo ============================================================
echo.
pause
exit /b 0

:mode_full
call "%~dp0publish-all-to-online.bat"
exit /b %ERRORLEVEL%
