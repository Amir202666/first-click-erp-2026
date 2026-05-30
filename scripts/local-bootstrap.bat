@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo ========================================
echo  إعداد السيرفر المحلي (Offline)
echo ========================================
echo.

call scripts\setup-local-env.bat
if errorlevel 1 exit /b 1

echo.
echo [1/4] التحقق من MySQL...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo.
  echo ❌ MySQL غير شغّال!
  echo    افتح XAMPP Control Panel واضغط Start بجانب MySQL
  echo    ثم أعد تشغيل هذا الملف.
  pause
  exit /b 1
)
echo [OK] MySQL يعمل

echo.
echo [2/4] إنشاء قاعدة البيانات...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS firstclick_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul

echo.
echo [3/4] Laravel setup...
cd backend
if not exist ".env" (
  copy /Y ".env.local.example" ".env" >nul
  php artisan key:generate
)
php artisan local:setup
if errorlevel 1 (
  echo.
  echo ❌ فشل الإعداد — تحقق من MySQL و backend\.env
  pause
  exit /b 1
)

cd ..
echo.
echo [4/4] تم!
echo.
echo ═══ بيانات الدخول المحلية ═══
echo   معرف الشركة:  first-company
echo   اسم المستخدم:  firstclick-erp
echo   كلمة المرور:   FirstClickERP
echo.
echo   شغّل: scripts\local-dev.cmd
echo   افتح: http://localhost:5173
echo.
pause
