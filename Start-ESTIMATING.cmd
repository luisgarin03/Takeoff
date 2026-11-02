@echo off
powershell.exe -NoProfile -File "%~dp0Start-ESTIMATING.ps1" %*
if errorlevel 1 pause
