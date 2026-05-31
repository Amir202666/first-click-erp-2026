@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set "URL=https://firstclickerp.top/deploy-revision.txt"
set "EXPECTED=50e7602"

echo التحقق من الإنتاج: %URL%
echo.

where curl.exe >nul 2>&1
if errorlevel 1 (
  echo ❌ curl.exe غير موجود
  pause
  exit /b 1
)

for /f "delims=" %%i in ('curl.exe -sS --max-time 25 "%URL%" 2^>nul') do set "REV=%%i"
if not defined REV (
  echo ❌ لا يمكن الوصول للموقع أو الملف غير موجود.
  echo    نفّذ النشر أولاً: scripts\deploy-to-server.bat
  pause
  exit /b 1
)

echo revision على السيرفر: %REV%
echo آخر commit محلي: 
git log -1 --oneline
echo.

echo %REV% | findstr /i "%EXPECTED%" >nul
if errorlevel 1 (
  echo ⚠️  السيرفر قديم — شغّل deploy-to-server.bat أو الأمر على Hostinger Terminal
) else (
  echo ✅ السيرفر محدّث تقريباً إلى آخر نشر.
)

echo.
echo فحص index (Google Fonts = نسخة قديمة):
curl.exe -sS --max-time 25 "https://firstclickerp.top/" 2>nul | findstr /i "googleapis fc_shell_version" 
if errorlevel 1 (
  echo    لا توجد googleapis في الصفحة الرئيسية — جيد.
) else (
  echo    ⚠️  ما زالت googleapis أو نسخة قديمة — امسح Service Worker
)
echo.
pause
