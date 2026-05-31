@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

echo ════════════════════════════════════════
echo   تصدير عملات + فروع + مراكز تكلفة
echo   الشركة: %SLUG%
echo ════════════════════════════════════════
echo.

cd backend
php artisan tenant:sync-reference export --slug=%SLUG%
if errorlevel 1 (
  cd ..
  pause
  exit /b 1
)
cd ..

echo.
echo الملف في: backend\storage\app\exports\
echo الخطوة التالية: scripts\upload-reference-to-server.bat %SLUG%
echo.
pause
