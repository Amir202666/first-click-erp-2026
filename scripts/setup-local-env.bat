@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo ========================================
echo  إعداد بيئة التطوير المحلية
echo ========================================
echo.

if not exist "backend\.env" (
  copy /Y "backend\.env.local.example" "backend\.env" >nul
  echo [OK] backend\.env
) else (
  echo [--] backend\.env موجود مسبقاً
)

if not exist "frontend\.env.local" (
  copy /Y "frontend\.env.local.example" "frontend\.env.local" >nul
  echo [OK] frontend\.env.local
) else (
  echo [--] frontend\.env.local موجود مسبقاً
)

echo.
echo للإعداد الكامل (MySQL + migrate + seed):
echo   scripts\local-bootstrap.bat
echo.
echo للتشغيل اليومي:
echo   scripts\local-dev.cmd
echo.
