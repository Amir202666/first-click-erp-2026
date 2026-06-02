@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

echo.
echo ========================================
echo   رفع العملات والبيانات المرجعية اونلاين
echo   (لا يكفي publish-online وحده بدون git push)
echo ========================================
echo.

call "%~dp0push-reference-to-github.bat" %SLUG%
if errorlevel 1 exit /b 1

echo.
echo --- على السيرفر (Hostinger) نفّذ ---
echo bash /var/www/erp/deploy/publish-online.sh
echo.
echo ثم Ctrl+Shift+R في المتصفح
pause
