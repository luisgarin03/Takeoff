@echo off
setlocal

set "ROOT=%~dp0"
set "WEB=%ROOT%web"
set "URL=http://127.0.0.1:5173/"

if not exist "%WEB%\package.json" (
    echo OpenTakeoff web app was not found at "%WEB%".
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found.
    echo Install Node.js LTS, then completely restart VS Code.
    pause
    exit /b 1
)

if not exist "%WEB%\node_modules" (
    echo Installing dependencies...
    pushd "%WEB%"
    call npm install
    if errorlevel 1 (
        popd
        pause
        exit /b 1
    )
    popd
)

echo Starting OpenTakeoff at %URL%
start "OpenTakeoff Dev Server" cmd /k "cd /d ""%WEB%"" && npm run dev -- --host 127.0.0.1"

timeout /t 3 /nobreak >nul
start "" "%URL%"

endlocal