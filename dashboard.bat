@echo off
setlocal
title Dashboard Redes
cd /d "%~dp0"
cls

echo =======================================================
echo    DASHBOARD REDES
echo =======================================================
echo.

:: ---------------------------------------------------------
:: Comprobar que la instalacion se hizo
:: ---------------------------------------------------------
if not exist ".venv\Scripts\python.exe" goto sin_instalar
if not exist "apps\frontend\node_modules" goto sin_instalar

:: ---------------------------------------------------------
:: Arrancar servicios
:: ---------------------------------------------------------
echo [+] Iniciando backend...
start "Dashboard-Backend" /min cmd /c "cd /d apps\backend && ..\..\.venv\Scripts\python.exe -m app.main"

echo [+] Iniciando frontend...
start "Dashboard-Frontend" /min cmd /c "cd /d apps\frontend && pnpm dev"

echo [+] Esperando a que respondan...
set INTENTOS=0

:esperar
netstat -aon | findstr :9511 | findstr LISTENING >nul 2>&1
if not errorlevel 1 goto arriba
set /a INTENTOS+=1
if %INTENTOS% GEQ 40 goto arriba
timeout /t 1 /nobreak >nul
goto esperar

:arriba
start http://127.0.0.1:9511

echo.
echo =======================================================
echo   LA APP ESTA ABIERTA EN TU NAVEGADOR
echo =======================================================
echo    http://127.0.0.1:9511
echo.
echo   Deja esta ventana abierta mientras la uses.
echo.
echo   Pulsa cualquier tecla aqui para CERRAR TODO.
echo =======================================================
echo.
pause >nul

:: ---------------------------------------------------------
:: Apagar
:: ---------------------------------------------------------
echo.
echo [-] Cerrando servicios...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9512 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9511 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo [OK] Todo cerrado. Puertos 9511 y 9512 liberados.
timeout /t 2 /nobreak >nul
exit /b 0

:: ---------------------------------------------------------
:sin_instalar
echo =======================================================
echo   LA HERRAMIENTA NO ESTA INSTALADA TODAVIA
echo =======================================================
echo.
echo Ejecuta primero:
echo.
echo      instalar.bat
echo.
echo Solo hace falta una vez.
echo.
pause
exit /b 1
