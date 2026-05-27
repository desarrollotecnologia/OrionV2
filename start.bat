@echo off

REM Lanzador SpoilBeeF - red local 192.168.20.205:8004

cd /d "%~dp0"



set FLASK_HOST=192.168.20.205

set FLASK_PORT=8004



if not exist .env (

  echo Copiando .env.example a .env...

  copy /Y .env.example .env >nul

  echo Edita .env con tus credenciales MySQL y la ruta del Excel.

  notepad .env

  pause

)



where python >nul 2>&1

if errorlevel 1 (

  echo Python no esta instalado o no esta en el PATH.

  pause

  exit /b 1

)



echo Instalando dependencias Python...

python -m pip install -r requirements.txt -q

if errorlevel 1 (

  echo Error instalando dependencias.

  pause

  exit /b 1

)



powershell -NoProfile -Command "$p = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue; if (-not $p) { Write-Host 'MySQL no responde en 127.0.0.1:3306. Inicia el servicio MySQL.'; exit 1 } else { Write-Host 'MySQL disponible en 3306.' }"

if errorlevel 1 (

  pause

  exit /b 1

)



echo Verificando .env...

python -c "import sys; from config import config; u=(config.DB_USER or '').strip(); p=(config.DB_PASSWORD or '').strip(); print('  DB_USER=' + u); print('  DB_PASSWORD=***' if p else '  DB_PASSWORD=(vacio)'); sys.exit(0 if u and p else 1)"

if errorlevel 1 (

  echo.

  echo ERROR: Revisa DB_USER y DB_PASSWORD en el archivo .env de esta carpeta:

  echo   %CD%\.env

  echo.

  notepad .env

  pause

  exit /b 1

)



echo.

echo ========================================

echo   SpoilBeeF - http://%FLASK_HOST%:%FLASK_PORT%/

echo   Acceso en red: http://192.168.20.205:8004/

echo ========================================

echo.



python app.py

pause

