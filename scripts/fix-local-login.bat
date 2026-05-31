@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo ========================================
echo  إصلاح تسجيل الدخول المحلي
echo ========================================
echo.

echo [1/4] إيقاف عمليات PHP القديمة...
taskkill /F /IM php.exe >nul 2>&1

echo [2/4] التحقق من MySQL...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo ❌ MySQL غير شغّال — شغّله من XAMPP مرة واحدة فقط
  pause
  exit /b 1
)
echo [OK] MySQL يعمل

echo [3/4] إعادة ضبط Super Admin...
cd backend
php artisan admin:fix-login
if errorlevel 1 (
  echo ❌ فشل admin:fix-login
  pause
  exit /b 1
)
cd ..

echo [4/4] تشغيل الخوادم...
start "FirstClick - Laravel" cmd /k "cd /d "%~dp0..\backend" && php artisan serve --host=127.0.0.1 --port=8000"
timeout /t 3 /nobreak >nul
start "FirstClick - Vite" cmd /k "cd /d "%~dp0..\frontend" && npm run dev"

echo.
echo ═══ افتح هذا الرابط بالضبط ═══
echo   http://127.0.0.1:5173/login
echo.
echo ═══ بيانات الدخول ═══
echo   معرف الشركة:  first-company
echo   المستخدم:     admin@firstclickerp.com
echo   كلمة المرور:  FirstClick@2026
echo.
echo   اضغط زر "ملء Super Admin" ثم أظهر كلمة المرور (أيقونة العين)
echo   وتأكد أنها FirstClick@2026 وليس FirstClickERP
echo.
pause
