@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-all.ps1" %*
exit /b %ERRORLEVEL%
