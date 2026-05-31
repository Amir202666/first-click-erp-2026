@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

echo ========================================
echo   Export + push reference data via GitHub
echo ========================================
echo.

call scripts\export-reference-local.bat %SLUG%
if errorlevel 1 exit /b 1

set "LATEST="
for /f "delims=" %%f in ('dir /b /od "backend\storage\app\exports\reference_%SLUG%_*.json" 2^>nul') do set "LATEST=%%f"

if "%LATEST%"=="" (
  echo ERROR: export file not found
  pause
  exit /b 1
)

if not exist "scripts\sync-data" mkdir "scripts\sync-data"
copy /Y "backend\storage\app\exports\%LATEST%" "scripts\sync-data\reference_%SLUG%.json" >nul
echo Copied to scripts\sync-data\reference_%SLUG%.json

git add "scripts/sync-data/reference_%SLUG%.json" deploy/import-reference.sh deploy/publish-online.sh
git commit -m "chore: sync reference master data for %SLUG%"
git push origin main
if errorlevel 1 (
  echo ERROR: git push failed
  pause
  exit /b 1
)

echo.
echo OK pushed to GitHub.
echo.
echo --- On SERVER (Hostinger Terminal) run ONE command ---
echo bash /var/www/erp/deploy/publish-online.sh
echo.
pause
