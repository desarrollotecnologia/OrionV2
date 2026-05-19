@echo off
REM Lanzador ORION (MySQL en puerto 3306, sin XAMPP)
cd /d "%~dp0"

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

python app.py
pause
