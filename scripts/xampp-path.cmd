@echo off
REM يحدد مسار XAMPP (يُستدعى من سكربتات أخرى)
if exist "C:\xampp2026\mysql\bin\mysql.exe" (
  set "XAMPP_ROOT=C:\xampp2026"
) else if exist "C:\xampp\mysql\bin\mysql.exe" (
  set "XAMPP_ROOT=C:\xampp"
) else (
  set "XAMPP_ROOT="
)
