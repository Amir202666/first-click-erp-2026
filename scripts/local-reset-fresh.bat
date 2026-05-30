@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo ========================================
echo  تصفير كامل — First Click ERP (محلي)
echo ========================================
echo.
echo  ⚠  سيُمسح كل شيء: عملاء، فواتير، حسابات، استيراد، …
echo  ✓  يُعاد: Super Admin + المالك + دليل 103 حساب
echo.

set /p CONFIRM="اكتب YES للمتابعة: "
if /i not "%CONFIRM%"=="YES" (
  echo تم الإلغاء.
  pause
  exit /b 0
)

call scripts\setup-local-env.bat
if errorlevel 1 exit /b 1

echo.
echo [1/3] التحقق من MySQL...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo ❌ MySQL غير شغّال — شغّله من XAMPP ثم أعد المحاولة.
  pause
  exit /b 1
)
echo [OK] MySQL يعمل

echo.
echo [2/3] إنشاء/تأكيد قاعدة البيانات...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS firstclick_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul

echo.
echo [3/3] تصفير وإعادة الإعداد...
cd backend
if not exist ".env" (
  copy /Y ".env.local.example" ".env" >nul
  php artisan key:generate
)
php artisan erp:factory-reset --force
if errorlevel 1 (
  echo ❌ فشل التصفير
  pause
  exit /b 1
)

cd ..
echo.
echo ═══ تم التصفير ═══
echo   شغّل: scripts\local-dev.cmd
echo   افتح: http://127.0.0.1:5173
echo.
echo   معرف الشركة:  first-company
echo   اسم المستخدم:  firstclick-erp
echo   كلمة المرور:   FirstClickERP
echo.
echo   بعد الاختبار محلياً:
echo   git add / commit / push  ثم  deploy على السيرفر
echo.
pause
