@echo off
REM Lanzador BeefFlow - red local 192.168.20.205:8004
cd /d "%~dp0"

set FLASK_HOST=192.168.20.205
set FLASK_PORT=8004

if not exist .env (
  echo Copiando .env.example a .env...
  copy /Y .env.example .env >nul
  echo Edita .env con DB_USER y DB_PASSWORD de database/setup_mysql.sql
)

powershell -NoProfile -Command "$p = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue; if (-not $p) { Write-Host 'MySQL no responde en 127.0.0.1:3306. Inicia el servicio MySQL.'; exit 1 } else { Write-Host 'MySQL disponible en 3306.' }"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo ========================================
echo   BeefFlow - http://%FLASK_HOST%:%FLASK_PORT%/
echo   Acceso en red: http://192.168.20.205:8004/
echo ========================================
echo.

python app.py
pause
