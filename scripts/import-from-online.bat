@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0..\backend"

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

set "IMP=storage\app\imports"

echo ========================================
echo   استيراد الإعدادات/التنسيقات من الأونلاين إلى الأوفلاين
echo   الشركة: %SLUG%
echo ========================================
echo.
echo ضع الملفات المنزّلة من السيرفر في:
echo   %CD%\%IMP%\
echo   - reference_%SLUG%.json   (بيانات مرجعية)
echo   - chart_%SLUG%.json       (دليل الحسابات)
echo   - settings_%SLUG%.json    (إعدادات + قوالب الطباعة)
echo.

REM 1) دليل الحسابات أولاً (لأن المرجعية قد تربط حسابات)
if exist "%IMP%\chart_%SLUG%.json" (
  echo [1/3] استيراد دليل الحسابات...
  php artisan accounts:replace-chart --slug=%SLUG% --file=%IMP%/chart_%SLUG%.json --force
) else (
  echo [1/3] تخطّي دليل الحسابات — الملف غير موجود
)
echo.

REM 2) البيانات المرجعية (عملات، فروع، مراكز تكلفة، وحدات، فئات، طرق دفع)
if exist "%IMP%\reference_%SLUG%.json" (
  echo [2/3] استيراد البيانات المرجعية...
  php artisan tenant:sync-reference import --slug=%SLUG% --file=%IMP%/reference_%SLUG%.json
) else (
  echo [2/3] تخطّي المرجعية — الملف غير موجود
)
echo.

REM 3) الإعدادات + قوالب الطباعة/المستندات
if exist "%IMP%\settings_%SLUG%.json" (
  echo [3/3] استيراد الإعدادات والقوالب...
  php artisan tenant:sync-settings import --slug=%SLUG% --file=%IMP%/settings_%SLUG%.json
) else (
  echo [3/3] تخطّي الإعدادات — الملف غير موجود
)

echo.
echo ✅ تم. شغّل: scripts\local-dev.cmd ثم افتح http://localhost:5173
echo.
pause
