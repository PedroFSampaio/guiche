@echo off
cd /d "%~dp0"
set "GUICHE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%GUICHE_NODE%" (
  "%GUICHE_NODE%" scripts\run-local.mjs start
) else (
  node scripts\run-local.mjs start
)
pause
