@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

set "SERVER=root@187.124.35.87"
set "REMOTE_DIR=/var/www/erp/backend/storage/app/imports"

echo ════════════════════════════════════════
echo   رفع بيانات مرجعية إلى السيرفر
echo ════════════════════════════════════════

set "LATEST="
for /f "delims=" %%f in ('dir /b /od "backend\storage\app\exports\reference_%SLUG%_*.json" 2^>nul') do set "LATEST=%%f"

if "%LATEST%"=="" (
  echo ❌ لا يوجد ملف تصدير. شغّل أولاً:
  echo    scripts\export-reference-local.bat %SLUG%
  pause
  exit /b 1
)

set "LOCAL_FILE=backend\storage\app\exports\%LATEST%"
set "REMOTE_FILE=%REMOTE_DIR%/reference_%SLUG%.json"

echo الملف: %LATEST%
echo.

scp "%LOCAL_FILE%" %SERVER%:%REMOTE_FILE%
if errorlevel 1 (
  echo ❌ فشل الرفع — تحقق من SSH
  pause
  exit /b 1
)

echo.
echo ═══ على السيرفر (Hostinger Terminal) ═══
echo cd /var/www/erp/backend ^&^& php artisan tenant:sync-reference import --slug=%SLUG% --file=storage/app/imports/reference_%SLUG%.json
echo.
pause
