@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

set "SERVER=root@187.124.35.87"
set "REMOTE_DIR=/var/www/erp/backend/storage/app/imports"

echo ========================================
echo   Upload reference data to server
echo   Company slug: %SLUG%
echo ========================================
echo.

if not exist "backend\storage\app\exports" (
  echo ERROR: Run export first:
  echo   scripts\export-reference-local.bat %SLUG%
  pause
  exit /b 1
)

set "LATEST="
for /f "delims=" %%f in ('dir /b /od "backend\storage\app\exports\reference_%SLUG%_*.json" 2^>nul') do set "LATEST=%%f"

if "%LATEST%"=="" (
  echo ERROR: No reference_%SLUG%_*.json found.
  echo Run: scripts\export-reference-local.bat %SLUG%
  pause
  exit /b 1
)

set "LOCAL_FILE=backend\storage\app\exports\%LATEST%"
set "REMOTE_FILE=%REMOTE_DIR%/reference_%SLUG%.json"

echo File: %LATEST%
echo Uploading to %SERVER% ...
echo.

scp "%LOCAL_FILE%" %SERVER%:%REMOTE_FILE%
if errorlevel 1 (
  echo.
  echo ERROR: SSH upload failed (often: Connection timed out from Windows).
  echo This is normal - Hostinger may block port 22 from your PC.
  echo.
  echo MANUAL UPLOAD:
  echo   1. Open File Explorer:
  echo      %CD%\backend\storage\app\exports\
  echo   2. Copy file: %LATEST%
  echo   3. Hostinger hPanel - File Manager - upload to:
  echo      /var/www/erp/backend/storage/app/imports/reference_%SLUG%.json
  echo   4. Hostinger Browser Terminal - run:
  echo      cd /var/www/erp/backend ^&^& php artisan tenant:sync-reference import --slug=%SLUG% --file=storage/app/imports/reference_%SLUG%.json
  echo.
  echo Full guide: scripts\MANUAL-UPLOAD-REFERENCE.md
  echo.
  start "" "%CD%\backend\storage\app\exports"
  pause
  exit /b 1
)

echo.
echo Upload OK.
echo.
echo --- Run on SERVER (Hostinger Terminal) ---
echo cd /var/www/erp/backend ^&^& php artisan tenant:sync-reference import --slug=%SLUG% --file=storage/app/imports/reference_%SLUG%.json
echo.
pause
