@echo off
cd /d "%~dp0"
call scripts\export-reference-local.bat %*
if errorlevel 1 exit /b 1
call scripts\upload-reference-to-server.bat %*
exit /b %ERRORLEVEL%
