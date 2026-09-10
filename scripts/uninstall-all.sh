#!/bin/sh
# dsh-vn-plugins uninstaller (console use; macOS/Linux twin of uninstall-all.bat).
# Shell builtins only - no dirname/basename/coreutils required.
set -u
case "$0" in
    */*) here=${0%/*} ;;
    *) here=. ;;
esac
here=$(CDPATH= cd -- "$here" && pwd)
if command -v pwsh >/dev/null 2>&1; then shell_bin=$(command -v pwsh)
elif command -v powershell >/dev/null 2>&1; then shell_bin=$(command -v powershell)
else echo "dsh-vn-plugins: PowerShell 7 (pwsh) is required - https://aka.ms/powershell" >&2; exit 1; fi
"$shell_bin" -NoProfile -File "$here/uninstall-all.ps1" "$@"
exit "$?"
