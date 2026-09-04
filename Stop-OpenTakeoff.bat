@echo off
setlocal

set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  set "FOUND=1"
  echo Stopping OpenTakeoff dev server on port 5173, process %%P...
  taskkill /PID %%P /T /F
)

if not defined FOUND (
  echo No OpenTakeoff dev server was found listening on port 5173.
)

endlocal
