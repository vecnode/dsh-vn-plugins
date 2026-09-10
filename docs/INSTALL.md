# Installing dsh-vn-plugins (Windows)

Quickest path: double-click **`install.bat`** at the repo root.

## Requirements

- Windows 10/11, PowerShell 5.1+ (built in)
- Node.js 22+ (needed to run dsh and pnpm) — https://nodejs.org
- `pnpm` is bootstrapped automatically into `.\tools` when missing

## What gets targeted

| Target | Profile | Location |
|---|---|---|
| web / CLI (`npx @deepseek-ai/dsh web`) | `web` | `$DSH_HOME\profiles\web` (`$DSH_HOME` = env var or `%USERPROFILE%\.dsh`) |

This is the **only** target. DSH Desktop is deliberately not supported any more
(the desktop app launches a frozen snapshot of its plugin set, so live edits
never showed up there); `-Target desktop` is rejected on purpose.

Overrides if the profile lives somewhere else:
`-DshHome <harness home> -ProfileName <profile>`.

> Upgrading from an older build of this pack: `install.bat` prunes the retired
> bundle names (`dsh-focus`, and `dsh-files` - the pack's own Files panel, which
> the harness now ships natively) from the profile before adding the current
> bundles, so you never end up with two docks.

## Manual path (no script)

```bat
set DSH_HOME=C:\Users\you\.dsh
npx --yes @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add C:\path\to\dsh-vn-plugins\packages\dsh-editor
```

(Requires `pnpm` on PATH.) Remove with the same command but `remove dsh-editor`.
If the profile still lists a retired name, `remove dsh-files` (and
`remove dsh-focus`) first - the scripts do this automatically.

## Uninstall

`uninstall.bat` (or `scripts\uninstall-all.bat`) — removes the bundles from the
web profile, plus any retired bundle name (`dsh-files`, `dsh-focus`).

## After installing

1. Start (or restart) `npx @deepseek-ai/dsh web` and open/select a conversation.
2. Open the right Sidebar with the **expand button** in the conversation header
   (top right). It opens on the shipped **Start** page, whose capsules list the
   Files tab and the new **Editor**. The tab strip's **"+"** opens that Start
   page again at any time.
3. Click a **text/code file** in the Files tab to open it in the **Editor**;
   Markdown, images and PDFs keep their own preview tabs. Picking *Editor* from
   the "+" page creates an empty editor tab with a workspace file picker.
4. Enter your API key in **Settings → Models** — installers never touch keys.

## Troubleshooting

- **`dsh` exits non-zero during install** — run again with `-Verbose` to see the
  exact command; most often this is a network hiccup fetching the pinned CLI.
- **Profile not found** — pass `-DshHome`/`-ProfileName`, or run
  `npx @deepseek-ai/dsh web` once so the profile exists.
- **`-Target desktop` is rejected** — intentional: DSH Desktop is no longer a
  target of this pack; run without `-Target` (or with `-Target web`).
- **Two Files panels / a stray right-hand dock after upgrading** — the retired
  `dsh-files` (or `dsh-focus`) bundle is still in the profile; re-run
  `install.bat` so its prune removes it.
- **No "Editor" capsule on the "+" / Start page** — pick an active
  conversation, restart and hard-refresh (Ctrl+F5); check the browser console
  for `[dsh-editor]` errors if it still does not show. The bar itself is the
  pack's own (`dsh-rightbar`), forked from the `0.1.5-rc.1` line.
- **A text file opens in the read-only preview** — that extension belongs to a
  shipped preview (`.md`, `.html`, images, `.pdf`, …) or the path is outside the
  conversation folder; the editor deliberately leaves those alone.
- **Editor says "Could not open the file" / keeps saving as changed on disk** —
  the session workspace root could not be resolved (open the conversation once),
  or the file changed under you: use **Reload** / **Save anyway** in the banner.
