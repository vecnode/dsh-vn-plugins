# AGENTS.md - guidance for coding agents in dsh-vn-plugins

This file is the quick-start brief. Read `ARCHITECTURE.md` for the deep dive.

## What this repo is

Personal plugin pack for DeepSeek Harness. It installs into ONE place only:

- the web profile: `npx @deepseek-ai/dsh web` (profile `web` under `DSH_HOME`,
  default `~/.dsh`)

DSH Desktop support was removed on purpose - the desktop app runs its own frozen
generation snapshot and this pack targets the raw web install alone. Do not add
desktop detection, a `-Target desktop` switch, or desktop install steps back.

Everything is a standard dsh **bundle**: an npm package with
`dsh.bundle` (+ `cordis.patch.yml`) and, for UI plugins, `dsh.client` and an
`exports["./client"]` browser bundle. Nothing patches DeepSeek core files.

**Platforms.** The plugins are plain JavaScript and must stay OS-neutral; the
only per-OS code allowed is a launcher choosing the right command for the host
(see `packages/dsh-open-in-app`). The tooling is PowerShell that runs on Windows
PowerShell 5.1 *and* PowerShell 7 (`pwsh`) on macOS/Linux: use `Join-Path`,
`[System.IO.Path]::PathSeparator` / `DirectorySeparatorChar`, `$PSVersionTable`
(never `$IsWindows` unguarded - 5.1 has no such variable), and the
`Get-ToolPath` / `Get-ToolNames` helpers instead of hardcoding `npx.cmd`,
`npm.cmd`, `powershell.exe`, `%USERPROFILE%` or `\` separators. Entry points come
in pairs: `install.bat` / `install.sh`, `uninstall.bat` / `uninstall.sh`, plus
the thin `scripts/*.bat` / `scripts/*.sh` twins.

## Layout

- `packages/<bundle>/` - one standalone bundle per plugin. Today:
  - `packages/dsh-rightbar/` - **the master**: the pack's own right bar (tab strip + "+", docking panel, expand button, Start/guide page, the `sidebarRightTabs` registry + `sidebarRight` controller, the keyed tab seats). `lib/client.js` is a GENERATED fork of `@deepseek-ai/dsh-client-ui-sidebar-right`; its `cordis.patch.yml` hard-disables the `ui-sidebar-right` / `ui-sidebar-files` rows and inserts `rightbar`.
  - `packages/dsh-rightbar-files/lib/client.js` - GENERATED fork of `@deepseek-ai/dsh-client-ui-sidebar-files`: the Files tab type on top of the bar
  - `packages/dsh-editor/lib/client.js` - browser half (hand-written, NO build step); the editor tab type (`dsh-resource://file/**` in the `extension` band) plus the guide entry the "+" control lists. "+" -> Editor opens a BLANK document; Save names it (extension included) through the shared `modals` dialog and creates it in the session workspace folder. Its CodeMirror palette follows the app's light/dark theme (oneDark only while the app is dark, a CodeMirror `Compartment` reconfigured live off `ctx.get('theme')` / `theme/change`, `body[data-ds-dark-theme]` as the fallback)
  - `packages/dsh-editor/lib/index.js` - Node half (authenticated `/api/dsh-editor/*` routes: read/save/CREATE text files by session, serve vendored CM6)
  - `packages/dsh-editor/lib/vendor/cm6.min.js` - GENERATED vendored CodeMirror 6 (rebuilt from `vendor/`, never hand-edited)
  - `packages/dsh-modal/` - the pack's shared dialog surface: `lib/client.js` mounts one body-level overlay on `document.body` (`react-dom/client` `createRoot`) and provides the client service **`modals`** (`open`/`alert`/`confirm`/`prompt`, async `submit` work with inline errors). No slot, no ordering edge; consumers use `ctx.get('modals')`
  - `packages/dsh-themes/` - the conversation header's **Themes** control: one 28px icon button registered into the slot LIST `conversation.session.header.utilities` at `order: -20`, i.e. immediately left of the shipped **Open In...** (which sits at `-10`), opening a `Menu` of Light / Dark / System. A **thin control**: the preference stays owned by the shipped `@deepseek-ai/dsh-client-ui-theme`, resolved lazily as `ctx.get('theme')` (`getTheme()` + `setTheme(id)` + the `theme/change` event), never declared in `inject`. The editor resolves the same service (and falls back to `body[data-ds-dark-theme]`) for its own palette
  - `packages/dsh-open-in-app/` - PATCHED fork of `@deepseek-ai/dsh-client-ui-open-in-app` (the Session header's "Open In..." button) whose file-manager ids post to a Node half that opens the OS file browser directly (`explorer.exe` / `open` / `xdg-open`, WSL-aware) instead of the shipped shell-open verb. The patch list is data in `scripts/sync-vendored.ps1`; its `cordis.patch.yml` disables `ui-open-in-app` and inserts `native-open-in-app`. The shipped HOST row (`open-in-app`) stays mounted for editors/terminals
  - each package's `cordis.patch.yml` - its bundle layer (rows, plus the master's disables)
- `scripts/install-all.ps1` / `uninstall-all.ps1` (OS-neutral PowerShell) with
  their `.bat` (Windows) and `.sh` (macOS/Linux) twins, plus the root
  `install.bat` / `install.sh` and `uninstall.bat` / `uninstall.sh` launchers
- `scripts/sync-vendored.ps1` - moves the forks forward after a harness-line bump
  (copies the core bundles, rewrites the module ids, applies each fork's patch
  list, stamps the banner; `-Check` reports drift without writing)
- `scripts/checks/` - standalone verification for the JS halves
  (`check-client-bundles.mjs` drives the browser bundles through a real React
  runtime, `check-node-routes.mjs` drives the Node route handlers)
- `.dsh-version.json` - the pinned dsh version, the `vendoredFrom` line, and
  per-package versions
- `docs/` - INSTALL + COMPATIBILITY notes (superseded in depth by ARCHITECTURE.md)

> Retired in alpha.2 of this pack: the first-generation **Files** plugin
> (`dsh-files`, before that `dsh-focus`) with its private dock, header capsules
> and `window.__dshFilesHost` bridge. Both install scripts still carry
> `$legacyNames = @('dsh-focus','dsh-files')` so an upgraded profile drops the
> old bundles instead of double-mounting.

## Golden rules

1. Target the pinned dsh line only (`0.1.5-rc.1`, see `.dsh-version.json`).
   Test against what the owner runs. When DSH publishes a new line, bump the
   pin, run `scripts/sync-vendored.ps1` (the right bar, the Files tab and the
   open-in-app client are **forks** of that line's bundles), then adapt - do not
   silently chase master APIs.
2. Plugins stay **alpha** (`-alpha.N`) until the owner says "make it stable".
3. Never touch DeepSeek core packages, the harness profile internals beyond
   what `dsh plugin` does, or API keys. The pack owns its right bar by
   **forking** the core bundles into `packages/` and hard-disabling the core
   rows - never by editing an installed core file.
4. The browser bundle is read at harness boot. The web profile installs every
   bundle as a live link into this repo, so after editing a `client.js`
   the app only needs a RESTART of `npx @deepseek-ai/dsh web` plus a hard
   browser refresh (Ctrl+F5) - no reinstall. Reinstall (a plain
   `install.bat` / `./install.sh`, which re-adds on version change, or `-Force`)
   is only needed when the package set or version changes. There is no HMR
   unless a `pnpm run dev:web` watcher from the harness repo is running.
5. Client bundles are module-table files:
   `window.__ModuleLoader__.load({ id, factory })`. Browser-only: no Node
   imports; you may `require("react")`; the shell statically seeds `react`,
   `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`,
   `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
   `@deepseek-ai/dsh-client-ui-primitives` and
   `@deepseek-ai/dsh-client-ui-dockkit`; anything else must be reached through
   `ctx.get(...)` after declaring it in the exported `inject` array
   (e.g. `["slots","sidebarRightTabs"]`). A client service is published with
   `ctx.reflect.provide(name, value)` (`sidebarRightTabs`, `sidebarRight`,
   `modals`); a service a consumer can live without - like `modals` - is
   resolved lazily at use time instead of being declared in `inject`. A tab type
   is TWO registrations: the static definition through
   `ctx.sidebarRightTabs.register(...)` and the keyed body/title through
   `ctx.slots.inject("sidebar.right.pane.tab"...)` with `key` = the
   definition's `id`; the "+" control lists every type that declares a `guide`
   entry on its definition.
6. Installer scripts are ASCII-only (smart quotes/dashes have broken parsing
   before) and must run on **Windows PowerShell 5.1 AND PowerShell 7+ on
   macOS/Linux** - see the Platforms note above. After editing a `.ps1`, run a
   parser check (see below).
7. When the pack branding is mentioned, the repo name is `dsh-vn-plugins`.
   Commits are authored as `vecnode <vecnode@users.noreply.github.com>`
   (git config is set in the repo).

## Commands

```bat
:: Windows
install.bat                   :: installs into the web profile (the only target)
install.bat -Force            :: re-add bundles even when versions match
uninstall.bat
```

```sh
# macOS / Linux (needs PowerShell 7: https://aka.ms/powershell)
./install.sh                  # the web profile (the only target)
./install.sh -Force           # re-add bundles even when versions match
./uninstall.sh
```

Both launchers just call the same OS-neutral script, so `pwsh -NoProfile -File
scripts/install-all.ps1 -Force` works everywhere too.

`-Target cli` is accepted as an alias for the web profile; there is no desktop
target any more. Everything runs through `npx --yes @deepseek-ai/dsh@<pinned>`;
pnpm is bootstrapped locally under `tools/pnpm<major>` (the profile's pnpm major
is read from `node_modules/.modules.yaml`).

> Package retirements: the panel was `dsh-focus` (row `focus`) until alpha.10,
> when it became `dsh-files` (row `files`), and in alpha.2 of the editor the
> whole first-generation Files package was dropped when the harness grew its own
> right Sidebar with a Files tab. From then on the pack **forks** the bar
> (`dsh-rightbar`, `dsh-rightbar-files`) and disables the core rows instead of
> depending on them. Both install scripts keep the
> `$legacyNames = @('dsh-focus','dsh-files')` prune so an upgraded profile drops
> the old bundles. Add future removed/renamed packages to that list in both
> scripts.

## Iterating on a change (quick loop)

```powershell
# 1. syntax-check a JS/PS file
node --check packages/dsh-editor/lib/client.js
node --check packages/dsh-rightbar/lib/index.js    # forked client.js is generated
$t=$null;$e=$null; [System.Management.Automation.Language.Parser]::ParseFile(
  'scripts/install-all.ps1',[ref]$t,[ref]$e); $e.Count   # expect 0

# 2. after a harness-line bump, move the forks forward (then review the diff).
#    On Windows use `powershell -NoProfile -ExecutionPolicy Bypass -File`;
#    on macOS/Linux use `pwsh -NoProfile -File`.
pwsh -NoProfile -File scripts/sync-vendored.ps1
pwsh -NoProfile -File scripts/sync-vendored.ps1 -Check

# 3. push the bundles into the web profile
pwsh -NoProfile -File scripts/install-all.ps1 -Force

# 4. verify the served bundle really contains the change (optional smoke):
$env:DSH_HOME = "$HOME/.dsh"          # Windows: "$env:USERPROFILE\.dsh"
npx --yes @deepseek-ai/dsh@0.1.5-rc.1 web --no-open --port 3099   # background
# then GET http://127.0.0.1:3099/?token=<token-from-log>, and confirm the boot
# HTML lists dsh-rightbar / dsh-rightbar-files / dsh-editor / dsh-modal /
# dsh-themes / dsh-open-in-app client.js and does NOT list the disabled core rows
# (@deepseek-ai/dsh-client-ui-sidebar-*, @deepseek-ai/dsh-client-ui-open-in-app).
# POST /api/dsh-open-in-app/open {"app":"explorer","path":"<abs dir>"} must open
# a real file-browser window; PUT /api/dsh-editor/file {"create":true,...} must
# create the file (and answer 409 EXISTS on a second try).

# 5. commit as vecnode and push
git add -A; git commit -m "describe the change"; git push
```

## Checklist before finishing a UI change

- [ ] `node --check` passes for every touched `.js`
- [ ] generated files untouched by hand (`dsh-rightbar*/lib/client.js`,
      `dsh-open-in-app/lib/client.js`, `dsh-editor/lib/vendor/cm6.min.js`) -
      re-sync/rebuild instead (`sync-vendored.ps1 -Check` must exit 0)
- [ ] `.ps1` files still parse and are ASCII-only
- [ ] version bumped (`packages/.../package.json` + `.dsh-version.json`) and
      installed with `-Force` to the web profile when behavior changed
- [ ] client bundles still activate and render: run the tracked checks
      (`node scripts/checks/check-client-bundles.mjs`,
      `node scripts/checks/check-node-routes.mjs`) - they drive the real React
      runtime through the module table and the Node route handlers directly
- [ ] README/`packages/*/README.md` bullets updated
- [ ] no core-file or profile-file edits beyond the installer's own writes
- [ ] pushed to `origin` (`main`) as vecnode
