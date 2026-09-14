@echo off
cd /d "%~dp0"
set "GUICHE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%GUICHE_NODE%" (
  "%GUICHE_NODE%" scripts\start-lan.mjs
) else (
  node scripts\start-lan.mjs
)
pause
