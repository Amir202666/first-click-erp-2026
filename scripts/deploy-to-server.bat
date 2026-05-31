@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "SERVER=root@187.124.35.87"
set "REMOTE_CMD=cd /var/www/erp && git fetch origin main && git reset --hard origin/main && bash deploy.sh"

echo ═══════════════════════════════════════════════════════════
echo   نشر First Click ERP على السيرفر
echo   (git push وحده لا يحدّث الموقع — هذا الأمر ضروري)
echo ═══════════════════════════════════════════════════════════
echo.
echo السيرفر: %SERVER%
echo.

where ssh >nul 2>&1
if errorlevel 1 (
  echo ❌ OpenSSH غير مثبت. استخدم Hostinger Terminal والصق:
  echo.
  echo   %REMOTE_CMD%
  echo.
  pause
  exit /b 1
)

echo جاري الاتصال والنشر... قد يستغرق 3-5 دقائق.
echo.
ssh -o ConnectTimeout=30 %SERVER% "%REMOTE_CMD%"
if errorlevel 1 (
  echo.
  echo ❌ فشل الاتصال أو النشر.
  echo.
  echo إذا انتهت المهلة: افتح Hostinger ^> VPS ^> Browser Terminal والصق:
  echo.
  echo   %REMOTE_CMD%
  echo.
  pause
  exit /b 1
)

echo.
echo ✅ انتهى النشر. تحقق من:
echo    https://firstclickerp.top/deploy-revision.txt
echo.
echo في المتصفح: Ctrl+Shift+R أو نافذة خاصة.
echo.
pause
