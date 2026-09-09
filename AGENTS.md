# AGENTS.md - guidance for coding agents in dsh-vn-plugins

This file is the quick-start brief. Read `ARCHITECTURE.md` for the deep dive.

## What this repo is

Personal plugin pack for DeepSeek Harness (Windows). It installs plugins into
two places:

- the raw CLI install: `npx @deepseek-ai/dsh web` (profile `web` under
  `DSH_HOME`, default `%USERPROFILE%\.dsh`)
- DSH Desktop (harness under `%APPDATA%\dsh-desktop\harness`)

Everything is a standard dsh **bundle**: an npm package with
`dsh.bundle` (+ `cordis.patch.yml`) and, for UI plugins, `dsh.client` and an
`exports["./client"]` browser bundle. Nothing patches DeepSeek core files.

## Layout

- `packages/<bundle>/` - one standalone bundle per plugin. Today:
  - `packages/dsh-files/lib/index.js` - Node half (minimal row so the client bundle ships)
  - `packages/dsh-files/lib/client.js` - browser half (single file, NO build step)
  - `packages/dsh-files/cordis.patch.yml` - bundle layer (rows + config overrides)
- `scripts/install-all.ps1` / `uninstall-all.ps1` (+ `.bat`, plus root
  `install.bat` / `uninstall.bat`)
- `.dsh-version.json` - the pinned dsh version and per-package versions
- `docs/` - INSTALL + COMPATIBILITY notes (superseded in depth by ARCHITECTURE.md)

## Golden rules

1. Target the pinned dsh line only (`0.1.2-rc.1`, see `.dsh-version.json`).
   Test against what the owner runs. When DSH publishes a new line, bump the
   pin and adapt - do not silently chase master APIs.
2. Plugins stay **alpha** (`-alpha.N`) until the owner says "make it stable".
3. Never touch DeepSeek core packages, the harness profile internals beyond
   what `dsh plugin` does, or API keys.
4. The browser bundle is read at harness boot. Both base profiles install
   `dsh-files` as a live link into this repo, so after editing
   `packages/dsh-files/lib/client.js` the CLI only needs a RESTART of
   `npx @deepseek-ai/dsh web` plus a hard browser refresh (Ctrl+F5) - no
   reinstall. Reinstall (`install.bat`, which re-adds on version change, or
   `-Force`) only refreshes the desktop generation, and the desktop snapshot
   refreshes when dsh-desktop is relaunched. There is no HMR unless a
   `pnpm run dev:web` watcher from the harness repo is running.
5. Client bundles are module-table files:
   `window.__ModuleLoader__.load({ id, factory })`. Browser-only: no Node
   imports; you may `require("react")`; reach core services through
   `ctx.get(...)` after declaring them in the exported `inject` array
   (e.g. `["slots","layout","sessions","remote"]`). Mirror how core consumers
   (ui-chat, ui-reference, ui-sidebar) do it. UI surface that must sit in the
   React tree (like the "Files" trigger next to the core "Session log"
   capsule) registers through `ctx.slots.inject` into a core-declared list
   seat - same as the shipped header-action plugins.
6. Installer scripts are Windows PowerShell 5.1-compatible AND ASCII-only
   (smart quotes/dashes have broken parsing before). After editing a `.ps1`,
   run a parser check (see below).
7. When the pack branding is mentioned, the repo name is `dsh-vn-plugins`.
   Commits are authored as `vecnode <vecnode@users.noreply.github.com>`
   (git config is set in the repo).

## Commands

```bat
install.bat                   :: both targets (desktop skipped with a warning when absent)
install.bat -Target cli       :: raw CLI profile only
install.bat -Target desktop   :: DSH Desktop only (close the app first)
install.bat -Force            :: re-add bundles even when versions match
uninstall.bat
```

Everything runs through `npx --yes @deepseek-ai/dsh@<pinned>`; pnpm is
bootstrapped locally under `tools\pnpm<major>` (the profile's pnpm major is
read from `node_modules\.modules.yaml`).

> Package renames: the panel was `dsh-focus` (row `focus`) until alpha.10,
> when it became `dsh-files` (row `files`). Both install scripts carry a
> `$legacyNames = @('dsh-focus')` prune so an upgraded profile drops the old
> bundle instead of double-mounting. Add renamed packages to that list in both
> scripts.

## Iterating on a change (quick loop)

```powershell
# 1. syntax-check a JS/PS file
node --check packages/dsh-files/lib/client.js
$t=$null;$e=$null; [System.Management.Automation.Language.Parser]::ParseFile(
  'scripts/install-all.ps1',[ref]$t,[ref]$e); $e.Count   # expect 0

# 2. push the new bundle into both profiles
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-all.ps1 -Target all -Force

# 3. verify the served bundle really contains the change (optional smoke):
$env:DSH_HOME = "$env:USERPROFILE\.dsh"
npx --yes @deepseek-ai/dsh@0.1.2-rc.1 web --no-open --port 3099   # background
# then GET http://127.0.0.1:3099/?token=<token-from-log>, find the
# /plugins/??...dsh-files/client.js URL in the HTML and confirm markers.

# 4. commit as vecnode and push
git add -A; git commit -m "describe the change"; git push
```

## Checklist before finishing a UI change

- [ ] `node --check` passes for every touched `.js`
- [ ] `.ps1` files still parse and are ASCII-only
- [ ] version bumped (`packages/.../package.json` + `.dsh-version.json`) and
      installed with `-Force` to both targets when behavior changed
- [ ] README/`packages/dsh-files/README.md` bullets updated
- [ ] no core-file or profile-file edits beyond the installer's own writes
- [ ] pushed to `origin` (`main`) as vecnode
