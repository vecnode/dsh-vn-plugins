# ARCHITECTURE.md - dsh-vn-plugins deep dive

This document explains how the repo, the installer, and the Files plugin
actually work against the DeepSeek Harness line they target
(`@deepseek-ai/dsh@0.1.2-rc.1`). Start with `AGENTS.md` for the short version.

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
packages/dsh-files/
  package.json        # name, version, dsh.bundle + dsh.client, exports
  cordis.patch.yml    # overrides file-reference-local row; inserts 'files' row
  lib/index.js        # Node half (no-op row so the client bundle ships)
  lib/client.js       # browser half (module-table bundle; hand-written, no build)
```

```
packages/dsh-editor/
  package.json        # name, version, dsh.bundle + dsh.client, exports
  cordis.patch.yml    # inserts 'editor' row (nothing else patched)
  lib/index.js        # Node half: authenticated /api/dsh-editor routes (file + vendor)
  lib/client.js       # browser half (module-table bundle; hand-written, no build)
  lib/vendor/cm6.min.js   # GENERATED vendored CodeMirror 6 classic bundle (commit it)
  vendor/entry.js, package.json  # reproducible CM6 build inputs (see its README)
```

> History: the plugin was `dsh-focus` (row `focus`) through alpha.9. alpha.10
> renamed it to `dsh-files` (row `files`) and reworked the dock into a
> tabbed panel host. `scripts/install-all.ps1` / `uninstall-all.ps1` prune
> the legacy `dsh-focus` bundle from profiles so an upgrade does not
> double-mount.

## 3. The browser bundle format (no build step)

Every core client package ships its browser half as a module-table entry:

```js
window.__ModuleLoader__.load({
  id: "dsh-files",               // package name
  factory: (require) => {
    var module = { exports: {} };
    // ... code, using require("react") for React and hooks ...
    exports.name = "dsh-files";
    exports.inject = ["slots", "sessions", "remote", "remote.fileReferences"];
    exports.apply = apply;                          // cordis apply(ctx)
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
  is absent (dsh-files renders a "starting the folder service" phase instead
  of a silently empty list).
- Seat surface: a slot occupant that must live inside the React tree (the
  "Files" trigger button, next to the core "Session log" capsule) registers
  through `ctx.slots.inject("conversation.session.header.utilities", ...)`,
  exactly like the shipped `dsh-session-log-export` header action does. The
  utilities seat is a core-declared list seat, so this is reliable on rc.1
  (unlike the empty `shell.overlay` panel seat, which is not).
- `require` of core packages is possible only for modules the browser seed
  provides (React, etc.) - keep runtime imports to a minimum.

**Why these client bundles are plain JavaScript, not TypeScript.** The format
above is the only one the harness serves: a single hand-written module-table
file per package, no build step. A TS pipeline would insert a compile between
every edit and the running GUI (there is no HMR unless a `pnpm run dev:web`
watcher from the harness repo runs), and would type against a client surface
that is still evolving. Plain JS + JSDoc keeps the edit -> restart loop
instant and the code greppable against the shipped core bundles.

## 4. How Files gets a real right-hand column (no overlap)

On the rc.1 line the GUI has NO third-party right-column seam: the layout is
a three-track grid (`sidebar | conversation | details`) where the `details`
track is single-occupant and owned by core `ui-chat`. Files cannot occupy it.

Instead Files reserves its **own** strip inside the AppFrame plus a plain-DOM
surface (alpha.8+, renamed from Focus):

1. **Geometry**: the core AppFrame is tagged `data-dsh-files-pad` and gets
   `padding-right: var(--dsh-files-w)` (box-sizing border-box), so the grid
   (`sidebar | conversation | details`) is squeezed left and the chat really
   shrinks. Files never calls `ctx.layout.openDetails()`, so the core empty
   "Details" placeholder can never open behind the panel and no layout
   service state machine can fight the panel's state.
2. **Surface**: a plain-DOM dock is the **sole** renderer - the React
   `shell.overlay` seat registration (the empty `ui-layout` list seat) is kept
   only as reference because on rc.1 it can throw or silently no-op depending
   on activation/mount order. The dock starts on `document.body`
   (position:fixed), **waits for / re-parents itself into the
   `[data-shell-overlay]` layer** once the core AppFrame commits, then tags
   the frame and sizes the strip.

The dock's width and the frame's padding-right share one CSS variable
(`--dsh-files-w`, written on the frame), so the strip the chat concedes
always equals the panel that fills it. Changes **snap** (no CSS transitions):
open/closed state flips the dock display together with the variable, so the
chat is never overlapped mid-change and the core "Details" content never shows
behind the panel.

**A tabbed panel host (alpha.10)**: the dock is now a small tab host. Each
open panel is a Claude-style **tab** in a strip on top of the dock; every tab
has its own close **x**. Files is the only registered panel today, but the
host (`createTabHost`) owns the open-set/order/active state and the tab strip
is rendered from it, so a future plugin adds a second descriptor and its own
header trigger and gets a second tab for free. alpha.12 realized that: the
content under the tab strip now switches per **active** panel (Files' chrome
is the built-in `files` section; other panels mount their own section lazily)
and the dock publishes a window host API (`window.__dshFilesHost`, event
`dsh-files:host-ready`) that sibling bundles use to register their panel —
`dsh-editor` is the first (see §6).

**No collapsed rail (alpha.10)**: the old always-visible edge rail is gone.
A panel is either expanded (its strip is reserved and the dock shows) or fully
hidden (the dock is `display:none` and the reserved width is 0, so the chat
reclaims the whole line). The open/closed gesture moved out of the dock into
the **session header**: a "Files" trigger button registered in the core
`conversation.session.header.utilities` seat (right of the shipped "Session
log" capsule) toggles the panel. Clicking it opens the Files tab; clicking it
again, or the tab's x, hides the dock.

**Resizing (drag divider)**: the dock renders its own edge grip at the
panel's left edge (the only divider line - the dock has no border of its
own). Dragging writes the CSS variable directly, so the edge tracks the
pointer; the width is clamped to at most ~1040px while the conversation keeps
its 640px minimum. Open tabs, width and the
hidden toggle persist in `localStorage` (`dsh-files.v1`).

**Duplicate-activation guard**: one `#dsh-files-host` element keeps a second
mount from stacking another dock.

**History (alpha.6/7)**: an early DOM panel bound itself to `document.body`
forever and sat at width 0 (body has no grid tracks) - the core "Details"
placeholder showed through an invisible dock while the track was open, and
later versions borrowed the core details track and measured its live grid
width. alpha.8 replaced that whole approach with the reserved strip above;
alpha.9 added a collapsed edge rail that reserved its own 56px; alpha.10
removed the rail and moved the trigger into the session header, so the dock is
expanded or gone and never floats.

## 5. Files data flow

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
- Rendering: the folder's entries rendered as
  an inline **tree** - folders first with a caret that rotates, files without
  any glyph and folders not tinted; clicking a folder **expands it in place**
  (indented) and deeper folders behave the same; expanded subfolders list
  through the same engine as the root (`face.loadPath(path, signal)`, added
  in alpha.7) with per-folder loading/error/waiting states. Dotfile rows are
  dimmed; a footer shows the item count and
  the hidden toggle; waiting/loading/error/empty states are explicit.
- **Toolbar (alpha.10)**: a Claude-Code-style row above the rows has a search
  input and a refresh button. Search filters the **currently loaded rows**
  client-side (by name/path substring, case-insensitive); whole-workspace
  fuzzy search is a follow-up (the same remote already supports bare-query
  search). Refresh re-lists the current folder and every expanded subfolder.

## 6. The Editor tab (dsh-editor)

Files stays the dock owner; **dsh-editor** is the first panel that *registers
into* it (a second standalone bundle, discovered by the installer like every
other package under `packages/`). The two bundles never share code: they meet
only on `window.__dshFilesHost`.

**The dock host contract (alpha.12, in dsh-files `lib/client.js`):**

- `registerPanel({ id, title, mount, acceptsOpenFile? })` — merge a descriptor
  into the dock's panel registry. `mount(el)` is called once, lazily, when the
  panel's tab first becomes active; it returns the panel controller.
- `openPanel/closePanel/activatePanel/togglePanel/isOpenPanel/getSnapshot/
  subscribe` — the tab host (same store Files' own trigger reads).
- `dispatchOpenFile(file)` — the Files tree calls this when a file row is
  double-clicked (rows stay inert without a registered `acceptsOpenFile`
  panel). It opens the first such panel and forwards
  `{ name, path, cwd, sessionId }` — `cwd` is the conversation folder the
  Files store is already scoped to.
- The host fires `dsh-files:host-ready` after publishing, and the editor
  bundle polls briefly as a fallback, so activation order does not matter.

**Editing without a file-content remote.** On the rc.1 line the client only
`list`s file references; nothing reads or writes file bytes. Mirroring the
shipped `dsh-session-log-export` ZIP route, the editor's Node half registers
**authenticated routes** on the `connection` service (`inject: ["connection"]`):

| Route | Behavior |
|---|---|
| `GET /api/dsh-editor/file?cwd&path` | realpath-containment check inside the conversation cwd; strict UTF-8 decode + NUL rejection (`NOT_TEXT` → binary files cannot open); ≤ 2 MiB; returns `{text, version, mtimeMs, size}` |
| `PUT /api/dsh-editor/file` | same containment; atomic temp-file + rename; optimistic guard — the echoed `mtimeMs`/`size` must match or it answers `409 CHANGED_ON_DISK` instead of clobbering |
| `GET /api/dsh-editor/vendor` | streams the vendored CodeMirror 6 classic bundle (committed `lib/vendor/cm6.min.js`, generated from `vendor/entry.js`, see the package README) |

The plain-fs row deliberately avoids the tool-layer fs sandbox/policy state
(it mirrors how `file-reference-local` reads cwd files with `node:fs` +
realpath) and only ever touches paths the owner's own GUI asks for.

**Browser half** registers the "Editor" capsule (same
`conversation.session.header.utilities` seat, `order: 200` → right of Files),
then lazily loads the vendored CM6 bundle on the first open, fetches the text
file, edits in CodeMirror, and saves on the toolbar button or Ctrl/Cmd+S.
`lib/client.js` is hand-written module-table code with **no build step**; only
the CM6 artifact is generated (when the version set changes).

## 7. The installer

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
- **Live links**: both base profiles install `dsh-files` as a `pnpm link:`
  junction straight into `packages\dsh-files` (`Test-LiveLink` detects this).
  Code edits then already apply to the CLI bundle - a restart of
  `npx @deepseek-ai/dsh web` plus a hard browser refresh is all it takes; the
  installer prints that instead of re-adding. The desktop app additionally
  launches a frozen generation snapshot that refreshes on the next dsh-desktop
  launch (the CLI's `plugin add` cannot rewrite it).
- **Legacy rename prune**: both install scripts remove a profile's stale
  `dsh-focus` bundle (kept in `$legacyNames = @('dsh-focus')`) before
  installing, so an upgrade from alpha.9 drops the old row/dock instead of
  double-mounting. Add future renamed packages to that list in both scripts.
- **Uninstall** removes the package and therefore its patch layer (the
  `file-reference-local` override disappears with it).

## 8. Versioning and upgrade path

- `.dsh-version.json` pins the dsh line and per-package versions.
- Packages stay `-alpha.N` until the owner says "make it stable".
- When DSH publishes a newer line: bump the pin, re-install with `-Force`,
  and adapt the affected API seams. The one seam most likely to change: DSH
  is building a native right Sidebar with a public tab-type registry; when it
  ships, Files should be re-homed onto that (the changes stay inside
  `lib/client.js` mounting code - the tab host already mirrors the shape of
  such a registry).

## 9. Troubleshooting quick table

| Symptom | Cause / action |
|---|---|
| Old panel still showing after edit | client bundle is read at boot; restart the app and HARD-refresh the browser (Ctrl+F5). The CLI profile is a live link, so no reinstall is needed; the desktop needs one relaunch to refresh its generation snapshot |
| Two docks / two tabs after upgrading | legacy `dsh-focus` row is still installed next to `dsh-files`; re-run `install.bat` (its prune removes `dsh-focus`) |
| No "Files" button beside "Session log" | the header utilities seat is core-owned and mounted per active session - check there is an active conversation, restart + hard-refresh, or the slots registration failed (see browser console `[dsh-files]`) |
| Installer fails with `virtual-store-dir-max-length` | profile created by a different pnpm major; scripts now auto-match - re-run installer |
| Desktop not detected | run DSH Desktop once so `harness\profiles` exists; pass `-DshHome`/`-ProfileName` to force |
| Plugin missing in DSH Desktop | app launched in Safe Mode (blocks third-party plugins) |
| `.ps1` parse error after editing | non-ASCII character crept in (smart quotes/dash); keep scripts ASCII-only |
| Folder list empty | inside an excluded dir (`.git`, `node_modules`, ...) or no visible files; enable "Show hidden" |

See also: `docs/INSTALL.md` (human steps) and `docs/COMPATIBILITY.md`
(version matrix).
