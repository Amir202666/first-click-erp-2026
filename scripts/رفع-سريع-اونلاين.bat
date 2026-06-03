@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

echo.
echo ============================================================
echo   رفع سريع: كل التعديلات المحلية ^(كود + واجهة مبنية^)
echo ============================================================
echo.
echo  سيرفع: الشاشات، API، migrations، CSS، إصلاح الشريط...
echo  لن يرفع: .env  |  لن يستبدل فواتير الإنتاج ^(إلا إن اخترت قاعدة كاملة^)
echo.

set "MODE=code"
if /i "%~1"=="full" set "MODE=full"
if /i "%~1"=="2" set "MODE=full"

if "%MODE%"=="full" (
  call "%~dp0رفع-كل-شيء.bat"
  exit /b %ERRORLEVEL%
)

set /p "OK=متابعة؟ اكتب Y ثم Enter: "
if /i not "!OK!"=="Y" exit /b 0

echo.
echo [1/3] بناء الواجهة ونسخها إلى backend\public ...
call "%~dp0..\build-production.cmd"
if errorlevel 1 (
  echo فشل البناء.
  pause
  exit /b 1
)

echo.
echo [2/3] رفع إلى GitHub ...
git add -A
git reset HEAD backend/.env frontend/.env.local 2>nul
git reset HEAD backend/storage/logs 2>nul
git reset HEAD backend/db_export.sql 2>nul
git reset HEAD scripts/backups/*.sqlite 2>nul

set "MSG=release: sync local to online"
if not "%~2"=="" set "MSG=%~2"

git commit -m "!MSG!"
if errorlevel 1 (
  echo لا توجد تغييرات جديدة للرفع — أو فشل commit.
) else (
  git push origin main
  if errorlevel 1 (
    echo فشل git push
    pause
    exit /b 1
  )
  echo OK: الكود على GitHub
)

echo.
echo --- بيانات مرجعية (عملات، فروع، مراكز تكلفة، طرق دفع) ---
call scripts\push-reference-to-github.bat first-company
if errorlevel 1 (
  echo تحذير: فشل رفع البيانات المرجعية — راجع الأمر أعلاه.
)

echo.
echo [3/3] النشر على السيرفر ...
where ssh >nul 2>&1
if not errorlevel 1 (
  echo محاولة SSH تلقائية...
  ssh -o ConnectTimeout=25 root@187.124.35.87 "bash /var/www/erp/deploy/publish-online.sh"
  if not errorlevel 1 goto done_ok
  echo SSH فشل — استخدم الأمر اليدوي أدناه.
)

echo.
echo ============================================================
echo   Hostinger ^> Browser Terminal — أمر واحد فقط:
echo ============================================================
echo.
echo   bash /var/www/erp/deploy/publish-online.sh
echo.
echo ============================================================
echo   ثم في المتصفح: Ctrl+Shift+R
echo   https://firstclickerp.top/deploy-revision.txt
echo ============================================================
echo.
pause
exit /b 0

:done_ok
echo.
echo تم النشر. Ctrl+Shift+R ثم تحقق من deploy-revision.txt
echo.
pause
exit /b 0
