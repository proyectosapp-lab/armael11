@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TSTE - correr todo

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
echo   Corre lo mismo que corre en la nube: pruebas, fuentes, feeds y sitio.
echo   Tarda unos minutos, no cierres la ventana.
echo.
echo   Si tenes la API key a mano y queres la tabla y el juego completos,
echo   abri este archivo con el Bloc de notas y poné tu key abajo.
echo.

rem set API_FOOTBALL_KEY=pegala_aca

node publicar.mjs > salida.txt 2>&1

type salida.txt
echo.
echo   ================================================================
echo   Listo. Todo esto quedo guardado en el archivo  salida.txt
echo   Mandaselo a Claude tal cual: esta al lado de este archivo.
echo   ================================================================
echo.
pause
