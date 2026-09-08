@echo off
rem ============================================================
rem  dsh-vn-plugins installer (double-click friendly)
rem  Installs the plugin pack into the CLI profile (npx dsh web)
rem  and/or dsh-desktop. Targets: all (default) | cli | desktop
rem  e.g.  install.bat -Target cli
rem ============================================================
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-all.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
echo ============================================================
if "%EXITCODE%"=="0" (
  echo  dsh-vn-plugins installed successfully.
) else (
  echo  dsh-vn-plugins install FAILED - see the messages above.
)
echo ============================================================
echo.
pause
exit /b %EXITCODE%
