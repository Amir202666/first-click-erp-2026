@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo ========================================
echo  First Click ERP - وضع التطوير
echo ========================================
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
echo   Health:   http://127.0.0.1:8000/api/health
echo.
echo   أغلق النوافذ لإيقاف الخوادم.
echo ========================================
echo.

start "FirstClick - Laravel" cmd /k "cd /d "%~dp0..\backend" && php artisan serve"
timeout /t 2 /nobreak >nul
start "FirstClick - Vite" cmd /k "cd /d "%~dp0..\frontend" && npm run dev"
