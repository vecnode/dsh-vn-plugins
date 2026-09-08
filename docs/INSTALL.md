# Installing dsh-plugins (Windows)

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

## Manual path (no script)

For one profile, run:

```bat
set DSH_HOME=C:\Users\you\.dsh
npx --yes @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add C:\path\to\dsh-plugins\packages\dsh-focus
```

(Requires `pnpm` on PATH.) Remove with the same command but `remove dsh-focus`.

## Uninstall

`uninstall.bat` (or `scripts\uninstall-all.bat`) — removes the bundles from
both targets. Bundle removal also reverts the `file-reference-local` row
override shipped by dsh-focus.

## After installing

1. CLI: start `npx @deepseek-ai/dsh web`, open/select a conversation.
   dsh-desktop: relaunch the app.
2. The **Focus** dock appears on the right edge of the window once a
   conversation is selected (auto-opens the first time). Click folders to
   descend; the footer toggles hidden (dot) files.
3. Enter your API key in **Settings → Models** — installers never touch keys.

## Troubleshooting

- **`dsh` exits non-zero during install** — run again with `-Verbose` to see the
  exact command; most often this is a network hiccup fetching the pinned CLI.
- **Profile not found for desktop** — start dsh-desktop once, close it, retry,
  or pass `-DshHome`/`-ProfileName`.
- **Plugin not visible in desktop** — the app runs Safe Mode (blocks third-party
  plugins) or a stale launch; relaunch from the normal profile.
- **Empty folder in Focus** — you're inside an excluded directory
  (`node_modules`, `.git`, `dist`, …) or the folder truly has no visible files;
  enable “Show hidden”.
