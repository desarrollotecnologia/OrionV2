@echo off

REM Lanzador BeefFlow - red local 192.168.20.205:8004

cd /d "%~dp0"



set FLASK_HOST=192.168.20.205

set FLASK_PORT=8004



if not exist .env (

  echo Copiando .env.example a .env...

  copy /Y .env.example .env >nul

  echo.

  echo IMPORTANTE: Edita .env con DB_USER y DB_PASSWORD antes de continuar.

  echo Ver database\setup_mysql.sql

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

python -m pip install -r requirements.txt

if errorlevel 1 (

  echo Error instalando dependencias. Revisa la conexion a internet o permisos de pip.

  pause

  exit /b 1

)



powershell -NoProfile -Command "$p = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue; if (-not $p) { Write-Host 'MySQL no responde en 127.0.0.1:3306. Inicia el servicio MySQL.'; exit 1 } else { Write-Host 'MySQL disponible en 3306.' }"

if errorlevel 1 (

  pause

  exit /b 1

)



set DB_PASS=

for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /I "DB_PASSWORD=" .env`) do set "DB_PASS=%%b"

if "%DB_PASS%"=="" (

  echo.

  echo ========================================

  echo   ERROR DE CONFIGURACION (.env)

  echo ========================================

  echo MySQL rechazo la conexion: falta DB_PASSWORD.

  echo.

  echo Edita el archivo .env en esta carpeta y pon:

  echo   DB_USER=orion_admin

  echo   DB_PASSWORD=la_contrasena_que_definiste

  echo.

  echo Si aun no creaste el usuario, ejecuta en MySQL:

  echo   database\setup_mysql.sql

  echo.

  notepad .env

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

