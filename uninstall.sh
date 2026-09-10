#!/bin/sh
# ============================================================
#  dsh-vn-plugins uninstaller (macOS / Linux; the Windows twin is uninstall.bat)
#  Removes this pack's bundles from the DeepSeek Harness web profile, together
#  with any retired bundle name it shipped before (dsh-focus, dsh-files).
#  Removing a bundle also removes its patch layer.
#
#  Needs PowerShell 7 (pwsh):  https://aka.ms/powershell
#  Shell builtins only - no dirname/basename/coreutils required.
# ============================================================
set -u

case "$0" in
    */*) here=${0%/*} ;;
    *) here=. ;;
esac
here=$(CDPATH= cd -- "$here" && pwd)

if command -v pwsh >/dev/null 2>&1; then
    shell_bin=$(command -v pwsh)
elif command -v powershell >/dev/null 2>&1; then
    shell_bin=$(command -v powershell)
else
    echo "dsh-vn-plugins: PowerShell 7 (pwsh) is required - https://aka.ms/powershell" >&2
    exit 1
fi

"$shell_bin" -NoProfile -File "$here/scripts/uninstall-all.ps1" "$@"
status=$?

echo
echo "============================================================"
if [ "$status" -eq 0 ]; then
    echo " dsh-vn-plugins removed successfully."
else
    echo " dsh-vn-plugins removal FAILED - see the messages above."
fi
echo "============================================================"
echo
exit "$status"
