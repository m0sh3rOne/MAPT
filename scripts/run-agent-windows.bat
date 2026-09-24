@echo off
echo =======================================================
echo    MAPT - Lancement de l'Agent Windows de Test
echo =======================================================

cd /d "%~dp0\..\agent"

if exist "mapt-agent.new.exe" (
    echo Mise a jour du binaire de l'agent...
    copy /y "mapt-agent.new.exe" "mapt-agent.exe" >nul 2>&1
)

if not exist "mapt-agent.exe" (
    echo Compilation de l'agent Go...
    where go >nul 2>&1
    if %errorLevel% equ 0 (
        go build -ldflags="-s -w" -o mapt-agent.exe ./cmd/agent
    ) else (
        wsl bash -c "cd '%~dp0/../agent' && GOOS=windows GOARCH=amd64 go build -ldflags='-s -w' -o mapt-agent.exe ./cmd/agent"
    )
)

echo.
:: Auto-elevation request if not administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Demande d'elevation administrateur pour l'Agent MAPT...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [OK] Privileges Administrateur confirmes.
echo.

echo Demarrage de l'agent connecte a http://localhost:8088/api/v1...
mapt-agent.exe -server "http://localhost:8088/api/v1"
pause
