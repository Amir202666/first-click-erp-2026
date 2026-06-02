@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set "XAMPP=C:\xampp2026"
if not exist "%XAMPP%\mysql\bin\mysqld.exe" set "XAMPP=C:\xampp"
if not exist "%XAMPP%\mysql\bin\mysqld.exe" (
  echo ❌ لم يُعثر على XAMPP في C:\xampp2026 أو C:\xampp
  pause
  exit /b 1
)

set "DATA=%XAMPP%\mysql\data"
set "BIN=%XAMPP%\mysql\bin"
set "BACKUP=%XAMPP%\mysql\backup"

echo.
echo ========================================
echo  إصلاح MySQL / MariaDB (XAMPP)
echo  المسار: %XAMPP%
echo ========================================
echo.

echo [1/7] إيقاف mysqld...
taskkill /F /IM mysqld.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/7] تنظيف ملفات الجلسة...
del /F /Q "%DATA%\mysql.pid" 2>nul
del /F /Q "%DATA%\mysqld.dmp" 2>nul

echo [3/7] نسخ aria_log احتياطياً ثم حذفها...
if not exist "%DATA%\_repair_backup" mkdir "%DATA%\_repair_backup"
for %%F in ("%DATA%\aria_log*") do (
  if exist %%F move /Y %%F "%DATA%\_repair_backup\" >nul 2>&1
)

echo [4/7] aria_chk على جداول النظام...
"%BIN%\aria_chk.exe" -r "%DATA%\mysql\*" 2>nul
if errorlevel 1 echo    ⚠ aria_chk أبلغ تحذيرات — نتابع...

echo [5/7] استعادة مجلد mysql من backup إن وُجد...
if exist "%BACKUP%\mysql" (
  if exist "%DATA%\mysql" (
    echo    نسخ mysql القديم إلى _repair_backup\mysql_old...
    if exist "%DATA%\_repair_backup\mysql_old" rmdir /s /q "%DATA%\_repair_backup\mysql_old"
    move /Y "%DATA%\mysql" "%DATA%\_repair_backup\mysql_old" >nul 2>&1
  )
  xcopy /E /I /Y "%BACKUP%\mysql" "%DATA%\mysql\" >nul
  echo    ✓ تم استعادة mysql من backup
) else (
  echo    -- لا يوجد backup\mysql — تخطي
)

echo [6/7] تشغيل MySQL...
start "MySQL-XAMPP" /MIN "%BIN%\mysqld.exe" --defaults-file="%XAMPP%\mysql\bin\my.ini" --standalone
echo    انتظر 8 ثوانٍ...
timeout /t 8 /nobreak >nul

echo [7/7] اختبار الاتصال...
"%BIN%\mysql.exe" -u root -e "SELECT 1 AS ok;" 2>nul
if errorlevel 1 (
  echo.
  echo ❌ MySQL لم يبدأ بعد. افتح XAMPP واضغط Start على MySQL، أو راجع:
  echo    %DATA%\mysql_error.log
  pause
  exit /b 1
)

echo.
echo ✅ MySQL يعمل على %XAMPP%
"%BIN%\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS firstclick_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo ✅ قاعدة firstclick_local جاهزة
echo.
echo الخطوة التالية من مجلد المشروع:
echo   scripts\local-bootstrap.bat
echo   scripts\local-dev.cmd
echo.
exit /b 0
