@echo off
REM Prepara tablas e importa Excel en el servidor (ejecutar una vez o al actualizar datos)
cd /d "%~dp0"

echo ========================================
echo   Cut Beef - Configuracion de base de datos
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python no esta instalado o no esta en el PATH.
  pause
  exit /b 1
)

if not exist .env (
  echo Falta el archivo .env. Copia .env.example y configuralo.
  pause
  exit /b 1
)

echo Instalando dependencias...
python -m pip install -r requirements.txt -q
if errorlevel 1 (
  echo Error instalando dependencias.
  pause
  exit /b 1
)

echo.
echo Paso 1: Si MySQL rechaza al usuario 'admin', ejecuta primero:
echo   database\grant_admin.sql   (como root en MySQL Workbench)
echo.
echo Paso 2: Verifica EXCEL_PATH en .env apunte al Excel en ESTE servidor.
echo.
pause

python setup_db.py
echo.
pause
