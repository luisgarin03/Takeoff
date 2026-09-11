@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Android-USB.ps1" %*

set "BUILD_EXIT=%ERRORLEVEL%"

echo.
pause

exit /b %BUILD_EXIT%