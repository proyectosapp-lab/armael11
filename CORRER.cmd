@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TSTE - correr el ingest

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No encuentro Node en esta computadora.
  echo.
  echo   Instalalo desde  https://nodejs.org  ^(el boton verde de la izquierda^),
  echo   cerra esta ventana, y volve a hacer doble clic aca.
  echo.
  pause
  exit /b
)

echo.
echo   Tres pasos. Tarda unos minutos, no cierres la ventana.
echo     1. Probar el pipeline (dos segundos, sin internet)
echo     2. Resolver los canales de YouTube
echo     3. Bajar todas las fuentes y armar los 30 feeds
echo.

> salida.txt (
  node probar.mjs
  echo.
  node probar-clubes.mjs
  echo.
  node resolver-youtube.mjs
  echo.
  node todos.mjs
) 2>&1

type salida.txt
echo.
echo   ================================================================
echo   Listo. Todo esto quedo guardado en el archivo  salida.txt
echo   Mandaselo a Claude tal cual: esta al lado de este archivo.
echo   ================================================================
echo.
pause
