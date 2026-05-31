@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo ============================================================
echo   Upload DB via download link (no WinSCP)
echo ============================================================
echo.

set "SQL_FILE=scripts\backups\UPLOAD_AS_db_backup.sql"
if not exist "%SQL_FILE%" (
  for /f "delims=" %%f in ('dir /b /od "scripts\backups\backup_*.sql" 2^>nul') do set "SQL_FILE=scripts\backups\%%f"
)

if not exist "%SQL_FILE%" (
  echo ERROR: No SQL file. Run: scripts\export-local-db.bat
  pause
  exit /b 1
)

echo File: %SQL_FILE%
for %%A in ("%SQL_FILE%") do echo Size: %%~zA bytes
echo.
echo Uploading to catbox.moe (wait ~30 sec)...
echo.

where curl >nul 2>&1
if errorlevel 1 (
  goto manual
)

set "URL="
for /f "usebackq delims=" %%u in (`curl.exe -s -F "reqtype=fileupload" -F "fileToUpload=@%SQL_FILE%" https://catbox.moe/user/api.php`) do set "URL=%%u"

echo %URL% | findstr /i "https://" >nul
if errorlevel 1 goto manual

echo.
echo ============================================================
echo   SUCCESS - Copy ALL lines below to Hostinger Terminal:
echo ============================================================
echo.
echo wget -O /var/www/erp/db_backup.sql "%URL%"
echo ls -lh /var/www/erp/db_backup.sql
echo bash /var/www/erp/deploy/publish-all-online.sh
echo.
echo ============================================================
echo.
echo Link (for manual wget if needed):
echo %URL%
echo.
pause
exit /b 0

:manual
echo.
echo AUTO upload failed. Do this manually:
echo.
echo 1) Open in browser:  https://catbox.moe/
echo 2) Click upload and choose:
echo    %CD%\%SQL_FILE%
echo 3) Copy the link you get (starts with https://files.catbox.moe/)
echo 4) On Hostinger VPS Terminal paste:
echo.
echo    wget -O /var/www/erp/db_backup.sql "PASTE_LINK_HERE"
echo    ls -lh /var/www/erp/db_backup.sql
echo    bash /var/www/erp/deploy/publish-all-online.sh
echo.
pause
exit /b 1
