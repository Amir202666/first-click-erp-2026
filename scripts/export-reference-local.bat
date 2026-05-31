@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "SLUG=first-company"
if not "%~1"=="" set "SLUG=%~1"

echo ========================================
echo   Export currencies, branches, cost centers
echo   Company slug: %SLUG%
echo ========================================
echo.

if not exist "backend\artisan" (
  echo ERROR: Run from project folder "first click"
  echo Current: %CD%
  pause
  exit /b 1
)

cd backend
php artisan tenant:sync-reference export --slug=%SLUG%
set "ERR=%ERRORLEVEL%"
cd ..
if not "%ERR%"=="0" (
  echo ERROR: export failed
  pause
  exit /b 1
)

echo.
echo OK. File saved under:
echo   %CD%\backend\storage\app\exports\
echo.
echo Next on THIS PC:
echo   scripts\upload-reference-to-server.bat %SLUG%
echo.
pause
