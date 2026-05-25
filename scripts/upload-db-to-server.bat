@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo ====================================
echo   Upload database to server
echo ====================================

set "SERVER_IP=187.124.35.87"
set "SERVER_USER=root"
set "SERVER_PATH=/var/www/erp"
set "BACKUP_DIR=scripts\backups"

if not exist "%BACKUP_DIR%" (
    echo ERROR: No backups folder. Run scripts\export-local-db.bat first.
    pause
    exit /b 1
)

set "LATEST="
for /f "delims=" %%f in ('dir /b /od "%BACKUP_DIR%\backup_*.sql" 2^>nul') do set "LATEST=%%f"

if "%LATEST%"=="" (
    echo ERROR: No backup_*.sql file found in %BACKUP_DIR%
    pause
    exit /b 1
)

echo Latest backup: %LATEST%
echo Server: %SERVER_USER%@%SERVER_IP%
echo.

echo Step 1 of 2 - Uploading file...
scp "%BACKUP_DIR%\%LATEST%" %SERVER_USER%@%SERVER_IP%:/tmp/db_backup.sql
if errorlevel 1 (
    echo ERROR: Upload failed. Check SSH password and OpenSSH client.
    pause
    exit /b 1
)

echo.
echo Step 2 of 2 - Importing on server...
ssh %SERVER_USER%@%SERVER_IP% "bash %SERVER_PATH%/scripts/sync-database.sh"
if errorlevel 1 (
    echo ERROR: Import failed. See SSH output above.
    pause
    exit /b 1
)

echo.
echo Done! Open http://firstclickerp.top
pause
