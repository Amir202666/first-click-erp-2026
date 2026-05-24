@echo off
REM Keep output ASCII-only to avoid encoding issues on Windows shells.
cd /d "%~dp0"

echo.
echo ========================================
echo  Production build (frontend -> backend\public)
echo ========================================
echo.

echo [1/2] Building frontend (vite only)...
pushd frontend
call npm run build:prod
if errorlevel 1 (
  echo Build failed.
  popd
  pause
  exit /b 1
)
popd

echo.
echo [2/2] Copying dist to backend\public...
xcopy /E /Y /I "frontend\dist\*" "backend\public\" >nul
if errorlevel 1 (
  echo Copy failed.
  pause
  exit /b 1
)
echo Done.

echo.
echo Root should point to: %~dp0backend\public
echo.

REM Avoid blocking non-interactive runs (CI / IDE tasks). Set BUILD_PRODUCTION_PAUSE=1 to wait for a keypress.
if defined BUILD_PRODUCTION_PAUSE (
  pause
)
