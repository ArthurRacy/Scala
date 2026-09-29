@echo off
rem ==========================================================================
rem  Abre o Sistema de Gestao de Anestesia neste computador (um clique).
rem  Sobe o servidor local (tools\servir.py) e abre o navegador sozinho.
rem  Para encerrar, feche esta janela.
rem ==========================================================================
chcp 65001 >nul
title Gestao de Anestesia
cd /d "%~dp0"

set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py

if not defined PY (
  echo.
  echo   Python nao foi encontrado neste computador.
  echo.
  echo   1. Instale pelo site https://www.python.org/downloads/
  echo   2. Na instalacao, marque "Add python.exe to PATH"
  echo   3. Abra este arquivo de novo
  echo.
  pause
  exit /b 1
)

echo.
echo   Abrindo o sistema... o navegador vai abrir sozinho.
echo   Deixe esta janela aberta enquanto usa o sistema.
echo.
%PY% tools\servir.py
pause
