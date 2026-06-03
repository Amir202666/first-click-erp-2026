@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "NO_PAUSE=%~1"

echo ====================================
echo   Export local database
echo ====================================

if not exist "backend\.env" (
    echo ERROR: backend\.env not found
    if not "%NO_PAUSE%"=="--no-pause" pause
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
    if "%%a"=="DB_CONNECTION" set "DB_CONN=%%b"
    if "%%a"=="DB_DATABASE" set "DB_NAME=%%b"
    if "%%a"=="DB_USERNAME" set "DB_USER=%%b"
    if "%%a"=="DB_PASSWORD" set "DB_PASS=%%b"
    if "%%a"=="DB_HOST" set "DB_HOST=%%b"
    if "%%a"=="DB_PORT" set "DB_PORT=%%b"
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%i"
set "OUT_FILE=%BACKUP_DIR%\backup_%TS%.sql"
set "OUT_ABS=%CD%\%OUT_FILE%"
set "EXPORT_OK=0"

if /i "%DB_CONN%"=="sqlite" (
    echo SQLite detected — exporting via artisan...
    pushd backend
    php artisan tenant:export --full --output="%OUT_ABS%"
    set "ART_EXIT=!ERRORLEVEL!"
    popd
    if exist "%OUT_ABS%" (
        for %%A in ("%OUT_ABS%") do if %%~zA GTR 500 set "EXPORT_OK=1"
    )
    if "!EXPORT_OK!"=="1" copy /Y "%OUT_ABS%" "%BACKUP_DIR%\UPLOAD_AS_db_backup.sql" >nul
    goto export_done
)

if "%DB_NAME%"=="" (
    echo ERROR: DB_DATABASE missing in .env
    if not "%NO_PAUSE%"=="--no-pause" pause
    exit /b 1
)

echo Database: %DB_NAME%
echo User: %DB_USER%
echo Host: %DB_HOST%:%DB_PORT%
echo Output: %OUT_FILE%
echo.

set "MYSQLDUMP="
if exist "C:\xampp\mysql\bin\mysqldump.exe" set "MYSQLDUMP=C:\xampp\mysql\bin\mysqldump.exe"
if "%MYSQLDUMP%"=="" if exist "C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe" set "MYSQLDUMP=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe"
if "%MYSQLDUMP%"=="" (
    for /f "delims=" %%p in ('where mysqldump 2^>nul') do if not defined MYSQLDUMP set "MYSQLDUMP=%%p"
)

set "EXPORT_OK=0"

if not "%MYSQLDUMP%"=="" (
    echo Trying mysqldump: %MYSQLDUMP%
    if "%DB_PASS%"=="" (
        "%MYSQLDUMP%" -h "%DB_HOST%" -P %DB_PORT% -u "%DB_USER%" --single-transaction --routines --triggers --default-character-set=utf8mb4 "%DB_NAME%" > "%OUT_ABS%" 2>"%TEMP%\fc_mysqldump_err.txt"
    ) else (
        set "MYSQL_PWD=%DB_PASS%"
        "%MYSQLDUMP%" -h "%DB_HOST%" -P %DB_PORT% -u "%DB_USER%" --single-transaction --routines --triggers --default-character-set=utf8mb4 "%DB_NAME%" > "%OUT_ABS%" 2>"%TEMP%\fc_mysqldump_err.txt"
        set "MYSQL_PWD="
    )
    if exist "%OUT_ABS%" (
        for %%A in ("%OUT_ABS%") do if %%~zA GTR 500 set "EXPORT_OK=1"
    )
    if "%EXPORT_OK%"=="0" if exist "%TEMP%\fc_mysqldump_err.txt" type "%TEMP%\fc_mysqldump_err.txt"
)

if "%EXPORT_OK%"=="0" (
    echo mysqldump failed - trying PHP artisan...
    cd backend
    php artisan tenant:export --full --output="%OUT_ABS%"
    set "ART_EXIT=%ERRORLEVEL%"
    cd ..
    if exist "%OUT_ABS%" (
        for %%A in ("%OUT_ABS%") do if %%~zA GTR 500 set "EXPORT_OK=1"
    )
    if not "%ART_EXIT%"=="0" set "EXPORT_OK=0"
)

:export_done
if "%EXPORT_OK%"=="0" (
    echo.
    echo ERROR: Export failed.
    echo Check: MySQL running in XAMPP/Laragon and backend\.env credentials.
    if not "%NO_PAUSE%"=="--no-pause" pause
    exit /b 1
)

echo.
echo Export OK: %OUT_FILE%
for %%A in ("%OUT_ABS%") do echo Size: %%~zA bytes
echo Also copied to: %BACKUP_DIR%\UPLOAD_AS_db_backup.sql
echo.
echo Next steps:
echo   1. Hostinger File Manager: upload UPLOAD_AS_db_backup.sql as /var/www/erp/db_backup.sql
echo   2. Hostinger Terminal: bash /var/www/erp/deploy/publish-all-online.sh
echo   3. Browser: Ctrl+Shift+R
if not "%NO_PAUSE%"=="--no-pause" pause
exit /b 0
