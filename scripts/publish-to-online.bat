@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~2"=="" set "SLUG=%~2"

echo.
echo ============================================================
echo   First Click ERP - Publish offline work to online
echo ============================================================
echo.
echo  What changed?
echo    [1] Code only (screens, fixes, features)
echo    [2] Master data only (currencies, branches, cost centers)
echo    [3] Code + master data (most common)
echo    [4] FULL database replace (DANGER - overwrites production)
echo    [Q] Quit
echo.

if "%~1"=="" (
  set /p "CHOICE=Choose 1/2/3/4/Q: "
) else (
  set "CHOICE=%~1"
)

if /i "!CHOICE!"=="Q" exit /b 0
if /i "!CHOICE!"=="4" goto full_db
if /i "!CHOICE!"=="2" goto master_only
if /i "!CHOICE!"=="3" goto code_and_master
if /i "!CHOICE!"=="1" goto code_only

echo Invalid choice.
pause
exit /b 1

:code_only
call :do_code_push
goto show_server
:code_and_master
call :do_code_push
call :do_master_push
goto show_server
:master_only
call :do_master_push
goto show_server

:full_db
echo.
echo WARNING: This replaces ALL production data with your local DB.
echo.
set /p "CONFIRM=Type YES to continue: "
if /i not "!CONFIRM!"=="YES" (
  echo Cancelled.
  pause
  exit /b 1
)
call scripts\export-local-db.bat
if errorlevel 1 exit /b 1
echo Upload via Hostinger File Manager: scripts\backups\latest.sql
echo Then on server: bash /var/www/erp/scripts/sync-database.sh
pause
exit /b 0

:do_code_push
echo.
echo --- Git: code ---
git status --short
echo.
set /p "DOCOMMIT=Commit and push? (Y/N): "
if /i not "!DOCOMMIT!"=="Y" goto :eof
set /p "MSG=Commit message: "
if "!MSG!"=="" set "MSG=update: publish from local"
git add -A
git reset HEAD backend/.env frontend/.env.local 2>nul
git reset HEAD backend/storage/logs 2>nul
git commit -m "!MSG!"
if errorlevel 1 (
  echo Nothing to commit or commit failed.
) else (
  git push origin main
  if errorlevel 1 (
    echo ERROR: git push failed
    pause
    exit /b 1
  )
  echo OK: code pushed to GitHub
)
goto :eof

:do_master_push
echo.
echo --- Master data (currencies, branches, cost centers) ---
call scripts\push-reference-to-github.bat %SLUG%
if errorlevel 1 exit /b 1
goto :eof

:show_server
echo.
echo ============================================================
echo   ON SERVER - Hostinger Browser Terminal - ONE command:
echo ============================================================
echo.
echo   bash /var/www/erp/deploy/publish-online.sh
echo.
echo ============================================================
echo   Then in browser: Ctrl+Shift+R (or Incognito)
echo   Check: https://firstclickerp.top/deploy-revision.txt
echo ============================================================
echo.
pause
exit /b 0
