@echo off
REM بناء الواجهة ونسخها إلى backend\public (للتجربة على http://127.0.0.1:8000)
cd /d "%~dp0..\frontend"
call npm run build
if errorlevel 1 exit /b 1
cd /d "%~dp0.."
if exist "backend\public\assets" rmdir /s /q "backend\public\assets"
xcopy /E /I /Y "frontend\dist\*" "backend\public\"
copy /Y "deploy\stubs\laravel-public\index.php" "backend\public\index.php"
copy /Y "deploy\stubs\laravel-public\.htaccess" "backend\public\.htaccess"
echo.
echo Done. Open: http://127.0.0.1:8000  OR use dev: cd frontend ^&^& npm run dev
pause
