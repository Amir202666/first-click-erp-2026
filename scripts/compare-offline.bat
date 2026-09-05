@echo off
chcp 65001 >nul
cd /d "%~dp0.."
setlocal EnableExtensions

echo.
echo ========================================
echo  فحص الأوفلاين فقط (بدون أونلاين)
echo ========================================
echo.
echo المجلد: %CD%
echo.

if not exist "backend\public\index.html" (
  echo [خطأ] لا يوجد backend\public\index.html
  echo نفّذ أولاً: build-production.cmd
  goto end
)

echo [1] index.html في backend\public
for %%F in ("backend\public\index.html") do echo     التاريخ: %%~tF   الحجم: %%~zF
echo.
echo     الملفات المشار إليها:
findstr /i /c:"assets/index-" "backend\public\index.html"
echo.

echo [2] هل ملفات الأصول موجودة فعلاً؟
set "MISSING=0"
for /f "tokens=2 delims==" %%A in ('findstr /i /c:"assets/index-" "backend\public\index.html"') do (
  rem raw-ish; better parse below
)
for /f "usebackq delims=" %%L in (`findstr /i /r /c:"assets/index-[^\"]*" "backend\public\index.html"`) do (
  echo     %%L
)

echo.
dir /b "backend\public\assets\index-*.js" 2>nul
dir /b "backend\public\assets\index-*.css" 2>nul
if not exist "backend\public\assets\index-*.js" (
  echo [تحذير] لا يوجد index-*.js داخل backend\public\assets
  set "MISSING=1"
)

echo.
echo [3] git المحلي (إن وُجد)
git rev-parse --short HEAD 2>nul
git log -1 --format="    %%ci  %%s" 2>nul
if errorlevel 1 echo     (لا يوجد git أو غير مهيأ)

echo.
echo [4] ماذا تفعل الآن حتى تظهر التنسيقات
echo     أ^) تأكد أن Laragon/Apache DocumentRoot =
echo        %CD%\backend\public
echo     ب^) في المتصفح F12 -^> Application -^> Service Workers -^> Unregister
echo     ج^) Application -^> Cache Storage -^> Delete all
echo     د^) Ctrl+Shift+R
echo     ه^) في Network افتح index-*.js وتأكد أنه نفس الاسم أعلاه
echo.

if "%MISSING%"=="1" (
  echo [مطلوب] شغّل: build-production.cmd ثم أعد هذا الفحص
)

:end
echo.
pause
