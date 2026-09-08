@echo off
rem ============================================================
rem  dsh-vn-plugins uninstaller (double-click friendly)
rem ============================================================
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-all.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
echo ============================================================
if "%EXITCODE%"=="0" (
  echo  dsh-vn-plugins removed successfully.
) else (
  echo  dsh-vn-plugins removal FAILED - see the messages above.
)
echo ============================================================
echo.
pause
exit /b %EXITCODE%
