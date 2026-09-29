@echo off
chcp 65001 >nul
title Sistema de Anestesia - servidor da clinica
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao foi encontrado neste computador.
  echo  Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo  Servidor do sistema de anestesia.
echo  DEIXE ESTA JANELA ABERTA enquanto a clinica usa o sistema.
echo  Os outros computadores entram pelo endereco "Na rede da clinica" abaixo.
echo  Se o Windows perguntar sobre o firewall, permita so em "Redes privadas".
echo  Para desligar: aperte Ctrl+C (o servidor grava tudo antes de sair).
echo.

start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080/"
node server\servidor.js --porta 8080 %*
echo.
pause
