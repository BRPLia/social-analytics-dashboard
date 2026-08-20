@echo off
setlocal
title Dashboard Redes - Instalador
cd /d "%~dp0"

echo =======================================================
echo    DASHBOARD REDES - INSTALADOR
echo =======================================================
echo.
echo Esto prepara la herramienta en tu equipo. Solo hace
echo falta ejecutarlo una vez.
echo.

set FALTA=0

:: ---------------------------------------------------------
:: 1. Comprobar requisitos previos
:: ---------------------------------------------------------
echo [1/5] Comprobando requisitos...
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo   [X] Python no esta instalado.
    echo       Descargalo en https://www.python.org/downloads/
    echo       IMPORTANTE: marca "Add Python to PATH" al instalarlo.
    set FALTA=1
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo   [OK] Python %%v
)

node --version >nul 2>&1
if errorlevel 1 (
    echo   [X] Node.js no esta instalado.
    echo       Descargalo en https://nodejs.org/  ^(version LTS^)
    set FALTA=1
) else (
    for /f %%v in ('node --version 2^>^&1') do echo   [OK] Node.js %%v
)

if "%FALTA%"=="1" (
    echo.
    echo =======================================================
    echo   FALTAN REQUISITOS
    echo =======================================================
    echo Instala lo marcado con [X], cierra esta ventana y
    echo vuelve a ejecutar instalar.bat.
    echo.
    pause
    exit /b 1
)

:: pnpm es opcional de partida: si no esta, se instala
call pnpm --version >nul 2>&1
if errorlevel 1 (
    echo   [..] pnpm no encontrado, instalandolo con npm...
    call npm install -g pnpm
    if errorlevel 1 (
        echo   [X] No se pudo instalar pnpm.
        echo       Prueba a abrir esta ventana como Administrador.
        echo.
        pause
        exit /b 1
    )
    echo   [OK] pnpm instalado
) else (
    for /f %%v in ('pnpm --version 2^>^&1') do echo   [OK] pnpm %%v
)

:: ---------------------------------------------------------
:: 2. Entorno virtual de Python
:: ---------------------------------------------------------
echo.
echo [2/5] Preparando entorno de Python...
if exist ".venv\Scripts\python.exe" (
    echo   [OK] El entorno .venv ya existe
) else (
    python -m venv .venv
    if errorlevel 1 (
        echo   [X] No se pudo crear el entorno virtual.
        echo.
        pause
        exit /b 1
    )
    echo   [OK] Entorno .venv creado
)

:: ---------------------------------------------------------
:: 3. Dependencias del backend
:: ---------------------------------------------------------
echo.
echo [3/5] Instalando dependencias del backend...
echo       ^(puede tardar un par de minutos^)
echo.
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
".venv\Scripts\python.exe" -m pip install -r "apps\backend\requirements.txt"
if errorlevel 1 (
    echo.
    echo   [X] Fallo la instalacion de dependencias de Python.
    echo.
    pause
    exit /b 1
)
echo   [OK] Backend listo

:: ---------------------------------------------------------
:: 4. Dependencias del frontend
:: ---------------------------------------------------------
echo.
echo [4/5] Instalando dependencias del frontend...
echo       ^(puede tardar un par de minutos^)
echo.
pushd "apps\frontend"
call pnpm install
if errorlevel 1 (
    popd
    echo.
    echo   [X] Fallo la instalacion de dependencias del frontend.
    echo.
    pause
    exit /b 1
)
popd
echo   [OK] Frontend listo

:: ---------------------------------------------------------
:: 5. Configuracion inicial
:: ---------------------------------------------------------
echo.
echo [5/5] Configuracion inicial...
if exist ".env" (
    echo   [OK] Ya tienes un archivo .env, no se toca
) else (
    copy ".env.example" ".env" >nul
    echo   [OK] Archivo .env creado a partir de .env.example
)
if not exist "storage" mkdir "storage"

echo.
echo =======================================================
echo   INSTALACION COMPLETADA
echo =======================================================
echo.
echo Ya puedes cerrar esta ventana y abrir la herramienta
echo con un doble clic en:
echo.
echo      dashboard.bat
echo.
echo No necesitas credenciales para empezar: en la pantalla
echo de bienvenida tienes "Explorar con datos de ejemplo".
echo.
pause
endlocal
