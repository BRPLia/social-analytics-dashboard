@echo off
title Dashboard Redes - Control
color 0B
clear

echo =======================================================
echo     DASHBOARD REDES - CONTROL
echo =======================================================
echo [Fuente: NURO] Inicializando servicios...
echo.

:: 1. Iniciar Backend en segundo plano (FastAPI en Puerto 9512)
echo [+] Iniciando Backend (FastAPI)...
start "Dashboard-Backend" /min cmd /c "cd /d %~dp0apps\backend && python -m app.main"

:: Esperar 2 segundos para dar tiempo al backend de arrancar
timeout /t 2 /nobreak >nul

:: 2. Iniciar Frontend en segundo plano (React/Vite en Puerto 9511)
echo [+] Iniciando Frontend (Vite + React)...
start "Dashboard-Frontend" /min cmd /c "cd /d %~dp0apps\frontend && pnpm dev"

:: Esperar 2 segundos para dar tiempo a Vite
timeout /t 2 /nobreak >nul

:: 3. Abrir la herramienta en el navegador
echo [+] Abriendo navegador en http://127.0.0.1:9511...
start http://127.0.0.1:9511

echo.
echo =======================================================
echo   SERVICIOS INICIADOS CORRECTAMENTE
echo =======================================================
echo * Frontend: http://127.0.0.1:9511
echo * Backend:  http://127.0.0.1:9512
echo =======================================================
echo.
echo Presiona cualquier tecla en esta ventana para APAGAR
echo por completo todos los servicios y liberar los puertos.
echo.
pause >nul

echo.
echo =======================================================
echo   DETENIENDO SERVICIOS...
echo =======================================================

:: Detener proceso en puerto 9512 (Backend)
echo [-] Deteniendo Backend en puerto 9512...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9512 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    echo [✔] Proceso %%a detenido.
)

:: Detener proceso en puerto 9511 (Frontend)
echo [-] Deteniendo Frontend en puerto 9511...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9511 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    echo [✔] Proceso %%a detenido.
)

echo.
echo [✔] Todos los servicios detenidos de forma segura.
echo [✔] Puertos 9511 y 9512 liberados.
echo.
echo Saliendo...
timeout /t 2 /nobreak >nul
exit
