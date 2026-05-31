@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

echo.
echo ============================================================
echo   Publish EVERYTHING: code + full database
echo   (all tables: items, customers, currencies, invoices, ...)
echo ============================================================
echo.
echo WARNING: Online database will match your LOCAL database
echo          after you complete step 3 on the server.
echo.
set /p "OK=Continue? (Y/N): "
if /i not "!OK!"=="Y" exit /b 0

echo.
echo ========== STEP 1/3: Push CODE to GitHub ==========
git status --short
echo.
set /p "DOCOMMIT=Commit all changes and push? (Y/N): "
if /i "!DOCOMMIT!"=="Y" (
  set /p "MSG=Commit message: "
  if "!MSG!"=="" set "MSG=update: sync all changes from local"
  git add -A
  git reset HEAD backend/.env frontend/.env.local 2>nul
  git reset HEAD backend/storage/logs 2>nul
  git commit -m "!MSG!"
  git push origin main
  if errorlevel 1 (
    echo ERROR: git push failed
    pause
    exit /b 1
  )
  echo OK: code on GitHub
) else (
  echo Skipped git - make sure you already pushed your code.
)

echo.
echo ========== STEP 2/3: Export LOCAL database ==========
call scripts\export-local-db.bat
if errorlevel 1 (
  pause
  exit /b 1
)

set "LATEST="
for /f "delims=" %%f in ('dir /b /od "scripts\backups\backup_*.sql" 2^>nul') do set "LATEST=%%f"

echo.
echo ========== STEP 3/3: Upload SQL to server (manual) ==========
echo.
echo SSH from Windows often fails - use Hostinger File Manager:
echo.
echo   1. Open folder on your PC:
echo      %CD%\scripts\backups\
echo   2. File to upload: %LATEST%
echo   3. In Hostinger upload to EXACT path:
echo      /tmp/db_backup.sql
echo.
echo   4. Then Hostinger - Browser Terminal - ONE command:
echo.
echo      bash /var/www/erp/deploy/publish-all-online.sh
echo.
echo   5. Browser: Ctrl+Shift+R on https://firstclickerp.top
echo.
start "" "%CD%\scripts\backups"
pause
