@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

set "LOCAL_FILE=backend\storage\app\exports\chart_%SLUG%.json"
set "SERVER=root@187.124.35.87"
set "REMOTE=/var/www/erp/backend/storage/app/imports/chart_%SLUG%.json"

if not exist "%LOCAL_FILE%" (
  echo ❌ الملف غير موجود. شغّل أولاً:
  echo    scripts\export-chart-local.bat %SLUG%
  pause
  exit /b 1
)

echo رفع دليل الحسابات إلى السيرفر...
scp "%LOCAL_FILE%" %SERVER%:%REMOTE%
if errorlevel 1 (
  echo ❌ فشل الرفع — تحقق من SSH
  pause
  exit /b 1
)

echo.
echo ✅ تم الرفع
echo.
echo ═══ على السيرفر (Hostinger Terminal) — أمر واحد ═══
echo cd /var/www/erp/backend ^&^& php artisan accounts:replace-chart --slug=%SLUG% --file=storage/app/imports/chart_%SLUG%.json --force
echo.
pause
