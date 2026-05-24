@echo off
chcp 65001 >nul
title تشغيل First Click ERP
cd /d "%~dp0"

echo.
echo  ========================================
echo   تشغيل الخادم الخلفي والواجهة الأمامية
echo  ========================================
echo.

start "First Click - Backend" cmd /k "cd /d "%~dp0backend" && echo تشغيل الخادم الخلفي... && php -d memory_limit=512M artisan serve"
timeout /t 3 /nobreak >nul

start "First Click - Frontend" cmd /k "cd /d "%~dp0frontend" && echo تشغيل الواجهة الأمامية... && npm run dev"

echo.
echo  تم فتح نافذتين:
echo  1) الخادم الخلفي (Backend) - لا تغلقها
echo  2) الواجهة الأمامية (Frontend) - لا تغلقها
echo.
echo  بعد اكتمال التشغيل افتح المتصفح على: http://localhost:5173
echo.
pause
