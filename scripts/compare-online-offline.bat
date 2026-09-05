@echo off
chcp 65001 >nul
cd /d "%~dp0.."
setlocal EnableExtensions

echo.
echo ========================================
echo  مقارنة الأوفلاين × الأونلاين
echo ========================================
echo.

set "LOCAL_HTML=backend\public\index.html"
if not exist "%LOCAL_HTML%" (
  echo [خطأ] غير موجود: %LOCAL_HTML%
  echo تأكد أنك داخل مجلد المشروع وأن البناء نُسخ إلى backend\public
  exit /b 1
)

echo [1] الأوفلاين: %CD%\%LOCAL_HTML%
for %%F in ("%LOCAL_HTML%") do echo     تاريخ الملف: %%~tF  الحجم: %%~zF بايت

echo.
echo     ملفات JS/CSS المحلية:
findstr /i /c:"/assets/" "%LOCAL_HTML%"

echo.
echo [2] الأونلاين: https://firstclickerp.top/
curl.exe -sS --max-time 25 -o "%TEMP%\fc_online_index.html" "https://firstclickerp.top/" 2>nul
if errorlevel 1 (
  echo     تعذر الوصول للأونلاين من هذا الجهاز.
) else (
  echo     ملفات JS/CSS الأونلاين:
  findstr /i /c:"/assets/" "%TEMP%\fc_online_index.html"
)

echo.
echo [3] رقم النشر الأونلاين:
curl.exe -sS --max-time 20 "https://firstclickerp.top/deploy-revision.txt" 2>nul
echo.

echo [4] رقم الـ commit المحلي:
git rev-parse --short HEAD 2>nul
git log -1 --format="    %%ci  %%s" 2>nul

echo.
echo [5] هل المتصفح يحمّل الملف الجديد؟
echo     افتح DevTools ^> Network ^> حدّث الصفحة وابحث عن index-*.js
echo     يجب أن يطابق الاسم الموجود في backend\public\index.html أعلاه.
echo.
echo [6] إن اختلف الاسم: امسح كاش PWA
echo     DevTools ^> Application ^> Service Workers ^> Unregister
echo     ثم Application ^> Cache Storage ^> Delete All
echo     ثم Ctrl+Shift+R
echo.
echo المسار الذي يجب أن يشير إليه Laragon/Apache:
echo     %CD%\backend\public
echo.
pause
