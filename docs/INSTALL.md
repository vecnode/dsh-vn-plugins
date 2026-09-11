# Installing dsh-vn-plugins (Windows, macOS, Linux)

Quickest path: double-click **`install.bat`** on Windows, or run
**`./install.sh`** on macOS/Linux. Both are thin wrappers around the same
OS-neutral PowerShell script.

## Requirements

- **Windows 10/11** with the built-in PowerShell 5.1, **or** macOS/Linux with
  **PowerShell 7+ (`pwsh`)** — https://aka.ms/powershell
- Node.js 22+ (needed to run dsh and pnpm) — https://nodejs.org
- `pnpm` is bootstrapped automatically into `./tools` when missing
- macOS/Linux only: the launchers need the executable bit, which git preserves
  (`chmod +x install.sh uninstall.sh scripts/*.sh` if you copied the files by
  hand)

## What gets targeted

| Target | Profile | Location |
|---|---|---|
| web / CLI (`npx @deepseek-ai/dsh web`) | `web` | `$DSH_HOME/profiles/web` (`$DSH_HOME` = env var, else `~/.dsh`) |

This is the **only** target. DSH Desktop is deliberately not supported any more
(the desktop app launches a frozen snapshot of its plugin set, so live edits
never showed up there); `-Target desktop` is rejected on purpose.

Overrides if the profile lives somewhere else:
`-DshHome <harness home> -ProfileName <profile>`.

> Upgrading from an older build of this pack: the installer prunes the retired
> bundle names (`dsh-focus`, and `dsh-files` - the pack's own Files panel, which
> the harness now ships natively) from the profile before adding the current
> bundles, so you never end up with two docks.

## The launchers

| Platform | Friendly (adds `-Force`) | Console |
|---|---|---|
| Windows | `install.bat` / `uninstall.bat` | `scripts\install-all.bat` / `scripts\uninstall-all.bat` |
| macOS / Linux | `./install.sh` / `./uninstall.sh` | `./scripts/install-all.sh` / `./scripts/uninstall-all.sh` |
| any (direct) | `pwsh -NoProfile -File scripts/install-all.ps1 -Force` | `pwsh -NoProfile -File scripts/uninstall-all.ps1` |

The friendly launchers pass `-Force` unless you already did, so running them
again always installs the latest edits. The console launchers behave like plain
script runs: they skip bundles that are already installed at the same version.

## Manual path (no script)

```bat
:: Windows
set DSH_HOME=C:\Users\you\.dsh
npx --yes @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add C:\path\to\dsh-vn-plugins\packages\dsh-editor
```

```sh
# macOS / Linux
export DSH_HOME="$HOME/.dsh"
npx --yes @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add /path/to/dsh-vn-plugins/packages/dsh-editor
```

(Requires `pnpm` on PATH.) Remove with the same command but `remove dsh-editor`.
If the profile still lists a retired name, `remove dsh-files` (and
`remove dsh-focus`) first - the scripts do this automatically.

## Uninstall

`uninstall.bat` (Windows) or `./uninstall.sh` (macOS/Linux) — removes the bundles
from the web profile, plus any retired bundle name (`dsh-files`, `dsh-focus`).

## After installing

1. Start (or restart) `npx @deepseek-ai/dsh web` and open/select a conversation.
2. Open the right Sidebar with the **expand button** in the conversation header
   (top right). It opens on the shipped **Start** page, whose capsules list the
   Files tab and the new **Editor**. The tab strip's **"+"** opens that Start
   page again at any time.
3. Click a **text/code file** in the Files tab to open it in the **Editor**;
   Markdown, images and PDFs keep their own preview tabs. Picking *Editor* from
   the "+" page starts a **blank** file: **Save** (or Ctrl+S) asks for its name
   with its extension and creates it in the conversation folder.
4. Enter your API key in **Settings → Models** — installers never touch keys.

## Troubleshooting

- **`dsh` exits non-zero during install** — run again with `-Verbose` to see the
  exact command; most often this is a network hiccup fetching the pinned CLI.
- **Profile not found** — pass `-DshHome`/`-ProfileName`, or run
  `npx @deepseek-ai/dsh web` once so the profile exists.
- **`pwsh: command not found` (macOS/Linux)** — install PowerShell 7:
  https://aka.ms/powershell
- **`./install.sh: Permission denied`** — `chmod +x install.sh uninstall.sh
  scripts/*.sh`.
- **`-Target desktop` is rejected** — intentional: DSH Desktop is no longer a
  target of this pack; run without `-Target` (or with `-Target web`).
- **Two Files panels / a stray right-hand dock after upgrading** — the retired
  `dsh-files` (or `dsh-focus`) bundle is still in the profile; re-run the
  installer so its prune removes it.
- **No "Editor" capsule on the "+" / Start page** — pick an active
  conversation, restart and hard-refresh (Ctrl+F5); check the browser console
  for `[dsh-editor]` errors if it still does not show. The bar itself is the
  pack's own (`dsh-rightbar`), forked from the `0.1.5-rc.1` line.
- **A text file opens in the read-only preview** — that extension belongs to a
  shipped preview (`.html`, images, `.pdf`, …) or the path is outside the
  conversation folder; the editor deliberately leaves those alone. Markdown is
  *not* one of them: `.md` opens editable, and its toolbar's **Preview** button
  opens the rendered view.
- **Save-as says the name is taken / the folder is missing** — pick another name
  (`409 EXISTS`), or use a subfolder that already exists (`404 NO_FOLDER`):
  nothing creates directories.
- **The "Open In…" File Explorer entry does nothing** — confirm the boot HTML
  lists `dsh-open-in-app/client.js` and not
  `@deepseek-ai/dsh-client-ui-open-in-app`; the pack's launcher reports a real
  failure (HTTP 502 → the button's red state) instead of a silent success.
- **Editor says "Could not open the file" / keeps saving as changed on disk** —
  the session workspace root could not be resolved (open the conversation once),
  or the file changed under you: use **Reload** / **Save anyway** in the banner.
- **No Themes button in the header (or it is greyed out)** — the button sits
  immediately left of **Open In…**; a new package needs one install run
  (`install.bat` / `./install.sh`, or `-Force`), then a restart. Greyed out means
  the shipped `@deepseek-ai/dsh-client-ui-theme` service (row `ui-theme`) is not
  in the boot graph — the tooltip says "The theme service is unavailable".
- **Code text looks black-on-dark in the light theme** — the editor follows the
  app's appearance; confirm the served `dsh-editor` bundle prints alpha.6 or
  later in a tab's file bar and hard-refresh (Ctrl+F5).
- **"Preview" says it is unavailable** — the right bar's controller could not be
  reached (the bar must be mounted, which it is while the editor tab is on
  screen) or the shipped document preview is not in the graph; the banner says
  which.
- **The rendered Markdown view is still dark, or unreadable on white** — that is
  `dsh-themes`' Markdown paper: it copies ui-theme's light palette out of the
  theme's own stylesheets at boot, and it injects nothing when it cannot read
  them (forcing white without the tokens would be worse). Reinstall so
  `dsh-themes` alpha.2+ is in the profile, then restart.
