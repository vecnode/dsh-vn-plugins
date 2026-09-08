# ARCHITECTURE.md - dsh-vn-plugins deep dive

This document explains how the repo, the installer, and the Focus plugin
actually work against the DeepSeek Harness line they target
(`@deepseek-ai/dsh@0.1.2-rc.1`). Start with `AGENTS.md` for the short
version.

## 1. The two install targets

DeepSeek Harness runs from a "profile": a directory that composes an ordered
stack of plugin-bundle layers. `dsh` discovers profiles under
`$DSH_HOME/profiles/<name>`.

| Target | DSH_HOME | Profile | Notes |
|---|---|---|---|
| raw CLI (`npx @deepseek-ai/dsh web`) | `DSH_HOME` env or `%USERPROFILE%\.dsh` | `web` | profile holds its own pnpm modules (store v3, virtual-store max length 120, pnpm 9) |
| DSH Desktop | `%APPDATA%\dsh-desktop\harness` | `web` (normal) | in-box bundles resolve from the desktop install's fallback; profile modules use pnpm 10 (store v10, max length 60) |

Both are just harness profiles; a bundle installed into either is loaded the
same way by the web composition. Safe Mode profiles (`*safe*`) are excluded.

## 2. How a plugin ships (bundle / profile / patch)

A **bundle** is an npm package whose `package.json` declares:

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },  // this package is a layer
  "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-locale", "..."] }
}
```

- `cordis.patch.yml` is a YAML array of rows. It can restate an existing row
  (a patch replaces the row's whole `config`) or `insert` new rows. Rows name
  their module by package name so Node resolution finds installed code.
- `dsh.client` makes the browser half of the package join the GUI. The host
  scans active Loader entries for this declaration, composes a boot graph
  (`window.__DSH_BOOT__`), and serves the package's `exports["./client"]`
  bundle over `/plugins`.
- Installation = `dsh plugin --profile <name> add <folder|npm|git>` which
  pnpm-installs the package into the profile and appends it to
  `dsh.profile.bundles` (order matters: later layers win per row).

A UI plugin therefore has **two halves in one package**:

```
packages/dsh-focus/
  package.json        # name, version, dsh.bundle + dsh.client, exports
  cordis.patch.yml    # overrides file-reference-local row; inserts 'focus' row
  lib/index.js        # Node half (no-op row so the client bundle ships)
  lib/client.js       # browser half (module-table bundle; hand-written, no build)
```

## 3. The browser bundle format (no build step)

Every core client package ships its browser half as a module-table entry:

```js
window.__ModuleLoader__.load({
  id: "dsh-focus",               // package name
  factory: (require) => {
    var module = { exports: {} };
    // ... code, using require("react") for React and hooks ...
    exports.name = "dsh-focus";
    exports.inject = ["slots", "layout", "sessions", "remote"]; // service deps
    exports.apply = apply;                                      // cordis apply(ctx)
    return module.exports;
  },
});
```

Rules learned from core consumers (ui-chat, ui-reference, ui-sidebar):

- Services are fetched with `ctx.get("<service>")`; each service used must be
  named in the exported `inject` array (activation waits for them).
- `slots` registers React components into seats; `layout` = `ctx.layout`
  (open/close panels); `sessions` = client session list; `remote` = the BFF
  namespaces (`remote.fileReferences`, ...).
- A namespaced remote is itself a cordis service that **mounts when its
  gateway contribution lands** - which can be after a consumer activates.
  Mirror core `ui-reference`: declare the dotted name in `inject`
  (`"remote.fileReferences"`) AND re-resolve it at use time, retrying while it
  is absent (dsh-focus renders a "starting the folder service" phase instead
  of a silently empty list).
- `require` of core packages is possible only for modules the browser seed
  provides (React, etc.) - keep runtime imports to a minimum.

**Why these client bundles are plain JavaScript, not TypeScript.** The format
above is the only one the harness serves: a single hand-written module-table
file per package, no build step. A TS pipeline would insert a compile between
every edit and the running GUI (there is no HMR unless a `pnpm run dev:web`
watcher from the harness repo runs), and would type against a client surface
that is still evolving. Plain JS + JSDoc keeps the edit -> restart loop
instant and the code greppable against the shipped core bundles.

## 4. How Focus gets a real right-hand column (no overlap)

On the rc.1 line the GUI has NO third-party right-column seam: the layout is
a three-track grid (`sidebar | conversation | details`) where the `details`
track is single-occupant and owned by core `ui-chat`. Focus cannot occupy it.

Instead Focus reserves its **own** strip inside the AppFrame plus a plain-DOM
surface (alpha.8):

1. **Geometry**: the core AppFrame is tagged `data-dsh-focus-pad` and gets
   `padding-right: var(--dsh-focus-w)` (box-sizing border-box), so the grid
   (`sidebar | conversation | details`) is squeezed left and the chat really
   shrinks. Focus no longer calls `ctx.layout.openDetails()`, so the core
   empty "Details" placeholder can never open behind the panel and no layout
   service state machine can fight the panel's open/collapsed state.
2. **Surface**: a plain-DOM dock is the **sole** renderer - the React
   `shell.overlay` seat registration (the empty `ui-layout` list seat) is kept
   only as reference because on rc.1 it can throw or silently no-op depending
   on activation/mount order. The dock starts on `document.body`
   (position:fixed), **waits for / re-parents itself into the
   `[data-shell-overlay]` layer** once the core AppFrame commits, then tags
   the frame and sizes the strip.

The dock's width and the frame's padding-right share one CSS variable
(`--dsh-focus-w`, written on the frame), so the strip the chat concedes
always equals the panel that fills it. Changes **snap** (no CSS transitions):
open/collapsed state flips the dock<->rail display together with the
variable, so the chat is never overlapped mid-change and the core "Details"
content never shows behind the panel.

**Resizing (drag divider)**: the dock renders its own edge grip at the
panel's left edge (the only divider line - the dock has no border of its
own). Dragging writes the CSS variable directly, so the edge tracks the
pointer; the width is clamped to the core details contract range (300…520px)
while the conversation keeps its 640px minimum. Open/collapsed state, width
and the hidden toggle persist in `localStorage` (`dsh-focus.v1`).

**Collapse/expand (always-visible bar)**: collapsing shrinks the strip to a
fixed 56px (`RAIL_W` - same as the core's collapsed left rail) and Focus
shows **only** its slim **rail** inside that strip, mirroring the collapsed
left sidebar: panel-outline expand control and a vertical "FOCUS" label. The
rail therefore sits BESIDE the chat (the chat column is squeezed by 56px),
never on top of it, and the dock is `display:none` while collapsed, so no
second ghost bar can remain on screen. Expanding re-opens the strip at the
persisted width; both controls are reachable (the overlay host is
pointer-events:none, so the rail opts back in explicitly). There is no close
(x) affordance anywhere. A duplicate-activation guard (one `#dsh-focus-host`
element) keeps a second mount from stacking another dock/rail pair.

**History (alpha.6/7)**: an early DOM panel bound itself to `document.body`
forever and sat at width 0 (body has no grid tracks) - the core "Details"
placeholder showed through an invisible dock while the track was open, and
later versions borrowed the core details track and measured its live grid
width. alpha.8 replaced that whole approach with the reserved strip above;
alpha.9 made the collapsed rail reserve its own 56px and hide the dock, so
the rail no longer floats over the chat and exactly one Focus bar is visible
in every state.

## 5. Focus data flow

- Current conversation: `ctx.sessions` -> `sessions.list.getSnapshot()`
  returns `{ ids, byId, current, ... }`. `byId[current].cwd` is the folder
  the conversation works in. The store subscribes to `sessions.list` and
  re-lists whenever the current session or its cwd changes.
- Folder entries: `ctx.remote.fileReferences.list(sessionId, query, signal)`
  - the same kind-aware, workspace-cwd-scoped remote that powers the `@` file
  menu. Directory-scoped queries list live state and return
  `{ path, kind: "file" | "directory" }` entries:
  - root listing: query `""`
  - subfolder: query `"sub/dir/"`
  - dotfiles: a second query `"./."` (root) or `"<dir>/."` whose fragment
    starts with `.` lets the backend reveal hidden entries - but that mode is
    fuzzy, so the client keeps only names that actually start with `.`,
    merges them with the plain listing and dedupes by path
- Dotfile visibility: **on by default** (footer "Hidden files" toggle turns
  them off). Either way the host never returns `.git`, `node_modules`,
  `dist`, `build`, `out`, `coverage`, `target`, `.next`, `.nuxt`, `.turbo`,
  `.venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.gradle`.
- The namespace is declared as `inject: [... 'remote.fileReferences']` and
  re-resolved before every listing. If it has not mounted yet the store sits
  in a `waiting` phase and retries, so the panel shows a status line instead
  of a silently empty folder (the phase that bit alpha.4: it only listed
  after a session switch and otherwise looked empty).
- Listing cap: the stock row caps answers at 20 rows, so `cordis.patch.yml`
  restates the `file-reference-local` row with `config.maxResults: 2000`.
- Rendering: folder path on top (monospace), the folder's entries rendered as
  an inline **tree** - folders first with a caret that rotates, files without
  any glyph and folders not tinted; clicking a folder **expands it in place**
  (indented) and deeper folders behave the same; expanded subfolders list
  through the same engine as the root (`face.loadPath(path, signal)`, added
  in alpha.7) with per-folder loading/error/waiting states. Dotfile rows are
  dimmed; a footer shows the item count and
  the hidden toggle; waiting/loading/error/empty states are explicit.

## 6. The installer

`scripts/install-all.ps1` / `uninstall-all.ps1` (PowerShell 5.1, ASCII only)
are driven by `install.bat` / `uninstall.bat`.

- **Detection**
  - CLI target: `DSH_HOME` env, else `%USERPROFILE%\.dsh`; profile `web`.
  - Desktop target: scans `%APPDATA%` and `%LOCALAPPDATA%` for
    `<dir>\harness\profiles`, then any profile directory with a
    `dsh.profile.bundles` list (dependencies may be empty on desktop - do NOT
    require `@deepseek-ai/dsh-base` as a dependency). Skips `node_modules`
    and safe/rescue/recovery profiles.
  - `-Target all` (default): a machine without DSH Desktop prints a warning,
    skips desktop, and succeeds. Explicit `-Target desktop` fails loudly when
    nothing is found.
- **dsh/pnpm invocation**: every operation runs
  `npx --yes @deepseek-ai/dsh@<pinned>` (pinned in `.dsh-version.json`).
  pnpm is bootstrapped locally under `tools\pnpm<major>` because the CLI and
  the desktop use different pnpm majors (9 vs 10) and different
  `virtualStoreDirMaxLength`. The script reads each profile's
  `node_modules\.modules.yaml`, picks the matching pnpm major, and exports
  `npm_config_virtual_store_dir_max_length` + the workspace-root-check
  opt-out (`npm_config_ignore_workspace_root_check=true`) because dsh
  profiles are pnpm workspace roots (`packages: [.]`).
  npm is invoked through `npm.cmd` explicitly (a `npm.ps1` resolution mangles
  `pkg@version` arguments).
- **Idempotency**: bundles already in `dsh.profile.bundles` are skipped
  unless `-Force` **or the repo version changed**.
- **Dev sync**: `Get-EffectiveInstalledVersion` compares the repo
  `package.json` version against the version the profile actually runs (for
  dsh-desktop that is the pinned `dsh.desktop.generationProjection`
  `visibleVersion`; elsewhere the installed package's own version). A plain
  double-click of `install.bat` after a version bump therefore re-adds the
  bundle, so development changes actually reach the targets.
- **Live links**: both base profiles install `dsh-focus` as a `pnpm link:`
  junction straight into `packages\dsh-focus` (`Test-LiveLink` detects this).
  Code edits then already apply to the CLI bundle - a restart of
  `npx @deepseek-ai/dsh web` plus a hard browser refresh is all it takes; the
  installer prints that instead of re-adding. The desktop app additionally
  launches a frozen generation snapshot that refreshes on the next dsh-desktop
  launch (the CLI's `plugin add` cannot rewrite it).
- **Uninstall** removes the package and therefore its patch layer (the
  `file-reference-local` override disappears with it).

## 7. Versioning and upgrade path

- `.dsh-version.json` pins the dsh line and per-package versions.
- Packages stay `-alpha.N` until the owner says "make it stable".
- When DSH publishes a newer line: bump the pin, re-install with `-Force`,
  and adapt the affected API seams. The one seam most likely to change: DSH
  is building a native right Sidebar with a public tab-type registry; when it
  ships, Focus should be re-homed onto that (the changes stay inside
  `lib/client.js` mounting code).

## 8. Troubleshooting quick table

| Symptom | Cause / action |
|---|---|
| Old panel still showing after edit | client bundle is read at boot; restart the app and HARD-refresh the browser (Ctrl+F5). The CLI profile is a live link, so no reinstall is needed; the desktop needs one relaunch to refresh its generation snapshot |
| Installer fails with `virtual-store-dir-max-length` | profile created by a different pnpm major; scripts now auto-match - re-run installer |
| Desktop not detected | run DSH Desktop once so `harness\profiles` exists; pass `-DshHome`/`-ProfileName` to force |
| Plugin missing in DSH Desktop | app launched in Safe Mode (blocks third-party plugins) |
| `.ps1` parse error after editing | non-ASCII character crept in (smart quotes/dash); keep scripts ASCII-only |
| Folder list empty | inside an excluded dir (`.git`, `node_modules`, ...) or no visible files; enable "Show hidden" |

See also: `docs/INSTALL.md` (human steps) and `docs/COMPATIBILITY.md`
(version matrix).
