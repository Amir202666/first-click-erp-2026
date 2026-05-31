@echo off
chcp 65001 >nul
cd /d "%~dp0..\backend"

echo ========================================
echo  تصدير دليل الحسابات من المحلي
echo ========================================
echo.

if not exist "storage\app\exports" mkdir "storage\app\exports"

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

php artisan accounts:export-chart --slug=%SLUG% --output=storage/app/exports/chart_%SLUG%.json
if errorlevel 1 (
  echo.
  echo ❌ فشل التصدير
  pause
  exit /b 1
)

echo.
echo ✅ الملف جاهز:
echo    backend\storage\app\exports\chart_%SLUG%.json
echo.
echo الخطوة التالية:
echo    scripts\upload-chart-to-server.bat %SLUG%
echo.
pause
