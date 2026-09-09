# Installing dsh-vn-plugins (Windows)

Quickest path: double-click **`install.bat`** at the repo root.

## Requirements

- Windows 10/11, PowerShell 5.1+ (built in)
- Node.js 22+ (needed to run dsh and pnpm) — https://nodejs.org
- `pnpm` is bootstrapped automatically into `.\tools` when missing
- For the desktop target: dsh-desktop installed and started **once** (so its
  harness profile exists); close it before installing/uninstalling

## What gets detected

| Target | Profile | Location |
|---|---|---|
| CLI (`npx @deepseek-ai/dsh web`) | `web` | `$DSH_HOME\profiles\web` (`$DSH_HOME` = env var or `%USERPROFILE%\.dsh`) |
| dsh-desktop | normal profile (auto-detected; excludes Safe Mode) | `%APPDATA%\<desktop app>\harness\profiles\<profile>` |

Overrides if auto-detection ever misses: `-DshHome <harness home> -ProfileName <profile>`.

> Desktop detection is **non-fatal** during `-Target all` (the default from
> `install.bat`): if no dsh-desktop harness profile exists the run warns,
> skips the desktop target, and still succeeds. Pass `-Target desktop` when
> you actually want the desktop app target — that mode fails loudly if nothing
> is found, so install/run dsh-desktop at least once first.

> Upgrading from alpha.9 (the plugin's old `dsh-focus` name): `install.bat`
> prunes the legacy `dsh-focus` bundle from each profile before adding
> `dsh-files`, so you never get two docks.

## Manual path (no script)

For one profile, run:

```bat
set DSH_HOME=C:\Users\you\.dsh
npx --yes @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add C:\path\to\dsh-vn-plugins\packages\dsh-files
```

(Requires `pnpm` on PATH.) Remove with the same command but `remove dsh-files`.
If the profile still lists the old name, `remove dsh-focus` first (the scripts
do this automatically).

## Uninstall

`uninstall.bat` (or `scripts\uninstall-all.bat`) — removes the bundles from
both targets (plus the legacy `dsh-focus` name). Bundle removal also reverts
the `file-reference-local` row override shipped by dsh-files.

## After installing

1. CLI: start `npx @deepseek-ai/dsh web`, open/select a conversation.
   dsh-desktop: relaunch the app.
2. In the conversation header, press the **Files** trigger (the capsule right
   of "Session log") — the Files panel opens on the right edge. Press it again
   (or the tab's **x**) to hide it. Click folders to descend; the search field
   filters the loaded rows; the refresh button re-lists; the footer toggles
   hidden (dot) files.
3. Enter your API key in **Settings → Models** — installers never touch keys.

## Troubleshooting

- **`dsh` exits non-zero during install** — run again with `-Verbose` to see the
  exact command; most often this is a network hiccup fetching the pinned CLI.
- **Profile not found for desktop** — start dsh-desktop once, close it, retry,
  or pass `-DshHome`/`-ProfileName`.
- **Plugin not visible in desktop** — the app runs Safe Mode (blocks third-party
  plugins) or a stale launch; relaunch from the normal profile.
- **Two docks / two tabs after upgrading** — the old `dsh-focus` row survived;
  re-run `install.bat` so its prune removes it.
- **No "Files" button beside "Session log"** — pick an active conversation,
  restart and hard-refresh (Ctrl+F5); check the browser console for
  `[dsh-files]` errors if it still does not show.
- **Empty folder in Files** — you're inside an excluded directory
  (`node_modules`, `.git`, `dist`, …) or the folder truly has no visible files;
  enable “Show hidden”.
