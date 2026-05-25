@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

echo ====================================
echo   Export local database
echo ====================================

if not exist "backend\.env" (
    echo ERROR: backend\.env not found
    pause
    exit /b 1
)

set "ENV_FILE=backend\.env"
set "BACKUP_DIR=scripts\backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set "DB_CONN="
set "DB_NAME="
set "DB_USER="
set "DB_PASS="
set "DB_HOST=127.0.0.1"
set "DB_PORT=3306"

for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^DB_CONNECTION= ^DB_DATABASE= ^DB_USERNAME= ^DB_PASSWORD= ^DB_HOST= ^DB_PORT= " "%ENV_FILE%"`) do (
    set "key=%%a"
    set "val=%%b"
    set "val=!val:"=!"
    if "!key!"=="DB_CONNECTION" set "DB_CONN=!val!"
    if "!key!"=="DB_DATABASE" set "DB_NAME=!val!"
    if "!key!"=="DB_USERNAME" set "DB_USER=!val!"
    if "!key!"=="DB_PASSWORD" set "DB_PASS=!val!"
    if "!key!"=="DB_HOST" set "DB_HOST=!val!"
    if "!key!"=="DB_PORT" set "DB_PORT=!val!"
)

if /i "%DB_CONN%"=="sqlite" (
    echo ERROR: DB is SQLite. Run: php artisan db:sqlite-to-mysql --fresh
    pause
    exit /b 1
)

if "%DB_NAME%"=="" (
    echo ERROR: DB_DATABASE missing in .env
    pause
    exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%i"
set "OUT_FILE=%BACKUP_DIR%\backup_%TS%.sql"

echo Database: %DB_NAME%
echo User: %DB_USER%
echo Output: %OUT_FILE%
echo.

set "MYSQLDUMP="
if exist "C:\xampp\mysql\bin\mysqldump.exe" set "MYSQLDUMP=C:\xampp\mysql\bin\mysqldump.exe"
if "%MYSQLDUMP%"=="" if exist "C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe" set "MYSQLDUMP=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe"
if "%MYSQLDUMP%"=="" (
    for /f "delims=" %%p in ('where mysqldump 2^>nul') do set "MYSQLDUMP=%%p"
)

if "%MYSQLDUMP%"=="" (
    echo ERROR: mysqldump not found
    pause
    exit /b 1
)

echo Exporting...
"%MYSQLDUMP%" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% --single-transaction --routines --triggers --default-character-set=utf8mb4 %DB_NAME% > "%OUT_FILE%"

if errorlevel 1 (
    echo ERROR: mysqldump failed
    pause
    exit /b 1
)

echo.
echo Export OK: %OUT_FILE%
echo Next: scripts\upload-db-to-server.bat
pause
