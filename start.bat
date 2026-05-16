@echo off
REM Lanzador rapido de ORION (Windows + XAMPP MariaDB)
cd /d "%~dp0"

if not exist .env (
  echo Copiando .env.example a .env...
  copy /Y .env.example .env >nul
)

REM Asegura que MariaDB de XAMPP este corriendo en el puerto 3306
powershell -NoProfile -Command "$p = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue; if (-not $p) { if (Test-Path 'C:\xampp\mysql\bin\mysqld.exe') { Write-Host 'Iniciando MariaDB de XAMPP...'; Start-Process -FilePath 'C:\xampp\mysql\bin\mysqld.exe' -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini' -WindowStyle Hidden; Start-Sleep -Seconds 5 } else { Write-Host 'MariaDB no encontrada. Inicia XAMPP manualmente.'; exit 1 } } else { Write-Host 'MariaDB ya esta corriendo en 3306.' }"

if errorlevel 1 (
  echo No se pudo iniciar MariaDB. Abre XAMPP y arranca MySQL manualmente.
  pause
  exit /b 1
)

python app.py
pause
