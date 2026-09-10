#!/bin/sh
# ============================================================
#  dsh-vn-plugins installer (macOS / Linux; the Windows twin is install.bat)
#  Installs the plugin pack into the DeepSeek Harness WEB profile only - the
#  raw install used by "npx @deepseek-ai/dsh web" (DSH_HOME, else ~/.dsh,
#  profile web). DSH Desktop is not supported by this pack.
#
#  A plain run always (re-)adds the bundles from this repo at their current
#  version - i.e. it behaves as if -Force had been passed - so running it
#  again always installs the latest edits, even when the profile already
#  lists the same version. Passing -Force yourself is still accepted.
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

# Same default as install.bat: force a re-add unless the caller asked already.
extra="-Force"
case " $* " in
    *" -Force "*|*" -force "*) extra="" ;;
esac

"$shell_bin" -NoProfile -File "$here/scripts/install-all.ps1" "$@" $extra
status=$?

echo
echo "============================================================"
if [ "$status" -eq 0 ]; then
    echo " dsh-vn-plugins installed successfully."
else
    echo " dsh-vn-plugins install FAILED - see the messages above."
fi
echo "============================================================"
echo
exit "$status"
