@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

echo.
echo ============================================================
echo   First Click — رفع كل شيء (كود + قاعدة بيانات) عبر GitHub
echo ============================================================
echo.
echo  يستبدل بيانات الاونلاين بما عندك محلياً.
echo.
set /p "OK=متابعة؟ (Y/N): "
if /i not "!OK!"=="Y" exit /b 0

echo.
echo [1/4] تصدير قاعدة SQLite المحلية...
call scripts\export-local-db.bat --no-pause
if errorlevel 1 (
  echo فشل التصدير.
  pause
  exit /b 1
)

echo.
echo [2/4] نسخ الى deploy\db_backup.sql ...
if not exist "deploy" mkdir "deploy"
copy /Y "scripts\backups\UPLOAD_AS_db_backup.sql" "deploy\db_backup.sql" >nul
if errorlevel 1 (
  echo فشل النسخ.
  pause
  exit /b 1
)

echo.
echo [3/4] رفع الكود + قاعدة البيانات الى GitHub...
git add -A
git reset HEAD backend/.env frontend/.env.local backend/db_export.sql 2>nul
git reset HEAD scripts/backups/*.sql scripts/backups/*.sqlite 2>nul
git add -f deploy/db_backup.sql
git status --short
echo.
set /p "DOCOMMIT=Commit and push? (Y/N): "
if /i not "!DOCOMMIT!"=="Y" goto server_cmd

set /p "MSG=Commit message (Enter = default): "
if "!MSG!"=="" set "MSG=sync: full local database and code to production"

git commit -m "!MSG!"
if errorlevel 1 (
  echo لا توجد تغييرات جديدة للرفع.
) else (
  git push origin main
  if errorlevel 1 (
    echo ERROR: git push failed
    pause
    exit /b 1
  )
  echo OK: GitHub updated
)

:server_cmd
echo.
echo ============================================================
echo   [4/4] على السيرفر — Hostinger VPS Terminal — أمر واحد:
echo ============================================================
echo.
echo   bash /var/www/erp/deploy/publish-all-online.sh
echo.
echo ============================================================
echo   ثم في المتصفح: Ctrl+Shift+R
echo   تحقق: https://firstclickerp.top/deploy-revision.txt
echo ============================================================
echo.
pause
exit /b 0
