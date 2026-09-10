# AGENTS.md - guidance for coding agents in dsh-vn-plugins

This file is the quick-start brief. Read `ARCHITECTURE.md` for the deep dive.

## What this repo is

Personal plugin pack for DeepSeek Harness (Windows). It installs into ONE place
only:

- the web profile: `npx @deepseek-ai/dsh web` (profile `web` under `DSH_HOME`,
  default `%USERPROFILE%\.dsh`)

DSH Desktop support was removed on purpose - the desktop app runs its own frozen
generation snapshot and this pack targets the raw web install alone. Do not add
desktop detection, a `-Target desktop` switch, or desktop install steps back.

Everything is a standard dsh **bundle**: an npm package with
`dsh.bundle` (+ `cordis.patch.yml`) and, for UI plugins, `dsh.client` and an
`exports["./client"]` browser bundle. Nothing patches DeepSeek core files.

## Layout

- `packages/<bundle>/` - one standalone bundle per plugin. Today:
  - `packages/dsh-editor/lib/index.js` - Node half (authenticated `/api/dsh-editor/*` routes: read/save text files by session, serve vendored CM6)
  - `packages/dsh-editor/lib/client.js` - browser half (single file, NO build step); registers the `editor` tab TYPE into the core right Sidebar (`ctx.sidebarRightTabs.register`) plus its body/title seats and the guide entry the "+" control lists
  - `packages/dsh-editor/lib/vendor/cm6.min.js` - GENERATED vendored CodeMirror 6 (rebuilt from `vendor/`, never hand-edited)
  - `packages/dsh-editor/cordis.patch.yml` - bundle layer (inserts the `editor` row)
- `scripts/install-all.ps1` / `uninstall-all.ps1` (+ `.bat`, plus root
  `install.bat` / `uninstall.bat`)
- `.dsh-version.json` - the pinned dsh version and per-package versions
- `docs/` - INSTALL + COMPATIBILITY notes (superseded in depth by ARCHITECTURE.md)

> Retired in alpha.2 of this pack: the pack's own **Files** plugin
> (`dsh-files`, before that `dsh-focus`) with its private dock, header capsules
> and `window.__dshFilesHost` bridge. The harness now ships that panel natively
> - the right Sidebar has its own Files tab - so the package is gone and the
> `editor` type registers straight into the product's tab-type registry. Both
> install scripts carry `$legacyNames = @('dsh-focus','dsh-files')` so an
> upgraded profile drops the old bundles instead of double-mounting.

## Golden rules

1. Target the pinned dsh line only (`0.1.5-rc.1`, see `.dsh-version.json`).
   Test against what the owner runs. When DSH publishes a new line, bump the
   pin and adapt - do not silently chase master APIs. The `editor` type needs
   the native right Sidebar (`@deepseek-ai/dsh-client-ui-sidebar-right`), which
   this line ships.
2. Plugins stay **alpha** (`-alpha.N`) until the owner says "make it stable".
3. Never touch DeepSeek core packages, the harness profile internals beyond
   what `dsh plugin` does, or API keys.
4. The browser bundle is read at harness boot. The web profile installs
   `dsh-editor` as a live link into this repo, so after editing
   `packages/dsh-editor/lib/client.js` the app only needs a RESTART of
   `npx @deepseek-ai/dsh web` plus a hard browser refresh (Ctrl+F5) - no
   reinstall. Reinstall (`install.bat`, which re-adds on version change, or
   `-Force`) is only needed when the package set or version changes. There is
   no HMR unless a `pnpm run dev:web` watcher from the harness repo is running.
5. Client bundles are module-table files:
   `window.__ModuleLoader__.load({ id, factory })`. Browser-only: no Node
   imports; you may `require("react")`; reach core services through
   `ctx.get(...)` after declaring them in the exported `inject` array
   (e.g. `["slots","sidebarRightTabs","remote.workspaceFiles"]`). Mirror how
   core consumers (ui-chat, ui-sidebar-right, ui-sidebar-files,
   ui-sidebar-documentpreview) do it. A tab type is TWO registrations: the
   static definition through `ctx.sidebarRightTabs.register(...)` and the
   keyed body/title through `ctx.slots.inject("sidebar.right.pane.tab"...)`
   with `key` = the definition's `id`; the "+" control lists every type that
   declares a `guide` entry on its definition.
6. Installer scripts are Windows PowerShell 5.1-compatible AND ASCII-only
   (smart quotes/dashes have broken parsing before). After editing a `.ps1`,
   run a parser check (see below).
7. When the pack branding is mentioned, the repo name is `dsh-vn-plugins`.
   Commits are authored as `vecnode <vecnode@users.noreply.github.com>`
   (git config is set in the repo).

## Commands

```bat
install.bat                   :: installs into the web profile (the only target)
install.bat -Force            :: re-add bundles even when versions match
uninstall.bat
```

`-Target cli` is accepted as an alias for the web profile; there is no desktop
target any more. Everything runs through `npx --yes @deepseek-ai/dsh@<pinned>`;
pnpm is bootstrapped locally under `tools\pnpm<major>` (the profile's pnpm major
is read from `node_modules\.modules.yaml`).

> Package retirements: the panel was `dsh-focus` (row `focus`) until alpha.10,
> when it became `dsh-files` (row `files`), and in alpha.2 of the editor the
> whole Files package was dropped because the GUI ships that tab natively. Both
> install scripts carry a `$legacyNames = @('dsh-focus','dsh-files')` prune so
> an upgraded profile drops the old bundle instead of double-mounting. Add
> future removed/renamed packages to that list in both scripts.

## Iterating on a change (quick loop)

```powershell
# 1. syntax-check a JS/PS file
node --check packages/dsh-editor/lib/client.js
$t=$null;$e=$null; [System.Management.Automation.Language.Parser]::ParseFile(
  'scripts/install-all.ps1',[ref]$t,[ref]$e); $e.Count   # expect 0

# 2. push the new bundle into the web profile
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-all.ps1 -Force

# 3. verify the served bundle really contains the change (optional smoke):
$env:DSH_HOME = "$env:USERPROFILE\.dsh"
npx --yes @deepseek-ai/dsh@0.1.5-rc.1 web --no-open --port 3099   # background
# then GET http://127.0.0.1:3099/?token=<token-from-log>, find the
# /plugins/??...dsh-editor/client.js URL in the HTML and confirm markers.

# 4. commit as vecnode and push
git add -A; git commit -m "describe the change"; git push
```

## Checklist before finishing a UI change

- [ ] `node --check` passes for every touched `.js`
- [ ] `.ps1` files still parse and are ASCII-only
- [ ] version bumped (`packages/.../package.json` + `.dsh-version.json`) and
      installed with `-Force` to the web profile when behavior changed
- [ ] README/`packages/dsh-editor/README.md` bullets updated
- [ ] no core-file or profile-file edits beyond the installer's own writes
- [ ] pushed to `origin` (`main`) as vecnode
