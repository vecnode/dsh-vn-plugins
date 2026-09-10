# ARCHITECTURE.md - dsh-vn-plugins deep dive

This document explains how the repo, the installer, and the Editor plugin
actually work against the DeepSeek Harness line they target
(`@deepseek-ai/dsh@0.1.5-rc.1`). Start with `AGENTS.md` for the short version.

## 1. The install target

DeepSeek Harness runs from a "profile": a directory that composes an ordered
stack of plugin-bundle layers. `dsh` discovers profiles under
`$DSH_HOME/profiles/<name>`.

| Target | DSH_HOME | Profile | Notes |
|---|---|---|---|
| web / CLI (`npx @deepseek-ai/dsh web`) | `DSH_HOME` env or `%USERPROFILE%\.dsh` | `web` | the only target; the profile holds its own pnpm modules (store v3, virtual-store max length 120, pnpm 9) |

DSH Desktop (the Electron app's harness home under
`%APPDATA%\dsh-desktop\harness`) is **deliberately not supported**: it launches
a frozen generation snapshot of its plugin set that only refreshes on app
relaunch, which made every code change a two-step dance. The installer, the
uninstaller and their docs target the web profile alone. Profiles that still
carry this pack's bundles from that era can be cleaned with
`uninstall.bat -DshHome "%APPDATA%\dsh-desktop\harness"` if it is ever needed -
but nothing in this repo does that automatically any more.

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

A UI plugin therefore has **two halves in one package** - and the pack has one
master (the bar) plus sub-plugins that live in it:

```
packages/dsh-rightbar/            # the master: the pack's own right bar
  package.json        # dsh.bundle + dsh.client
  cordis.patch.yml    # disables ui-sidebar-right / ui-sidebar-files, inserts 'rightbar'
  lib/index.js        # Node half: no-op row (the bar is browser-only)
  lib/client.js       # GENERATED fork of the shipped sidebar-right bundle
packages/dsh-rightbar-files/      # the Files tab type (same fork scheme)
packages/dsh-editor/              # sub-plugin: the editor tab type
  package.json        # name, version, dsh.bundle + dsh.client, exports
  cordis.patch.yml    # inserts the 'editor' row (nothing else patched)
  lib/index.js        # Node half: authenticated /api/dsh-editor routes (file + vendor)
  lib/client.js       # browser half (module-table bundle; hand-written, no build)
  lib/vendor/cm6.min.js   # GENERATED vendored CodeMirror 6 classic bundle (commit it)
  vendor/entry.js, package.json  # reproducible CM6 build inputs (see its README)
```

> History: the pack shipped its own right-hand panel as `dsh-focus` (row
> `focus`) through alpha.9, then as `dsh-files` (row `files`) from alpha.10,
> where it grew a tab-strip dock and published `window.__dshFilesHost` so a
> second bundle could register a tab into it. The harness has since shipped a
> **right Sidebar with a tab-type registry**, so that panel - dock, header
> capsules, host bridge and the `file-reference-local` row override - was
> retired in the editor's alpha.2, and the pack moved to registering tab types
> into the shipped bar. It now goes further and **owns the bar itself** by
> forking it (see §4). Both install scripts carry
> `$legacyNames = @('dsh-focus','dsh-files')` and prune those names from every
> profile they touch, so an upgrade cannot leave a stale bundle mounted.

## 3. The browser bundle format (no build step)

Every core client package ships its browser half as a module-table entry:

```js
window.__ModuleLoader__.load({
  id: "dsh-editor",              // package name
  factory: (require) => {
    var module = { exports: {} };
    // ... code, using require("react") for React and hooks ...
    exports.name = "dsh-editor";
    exports.inject = ["slots", "sidebarRightTabs", "remote.workspaceFiles"];
    exports.apply = apply;                          // cordis apply(ctx)
    return module.exports;
  },
});
```

Rules learned from core consumers (ui-sidebar-right, ui-sidebar-files,
ui-sidebar-documentpreview, ui-chat):

- Services are fetched with `ctx.get("<service>")`; each service used must be
  named in the exported `inject` array (activation waits for them). The
  right-Sidebar registry is the cordis service **`sidebarRightTabs`** and the
  navigation controller is **`sidebarRight`** - both provided by
  `@deepseek-ai/dsh-client-ui-sidebar-right`.
- A namespaced remote is itself a cordis service that **mounts when its
  gateway contribution lands** - which can be after a consumer activates.
  Declare the dotted name in `inject` (`"remote.workspaceFiles"`) AND
  re-resolve it at use time, so a slow namespace degrades to a typed failure
  instead of a silent blank panel.
- Registration is disposed through `ctx.effect(() => disposer, label)`: a tab
  type lives exactly as long as the plugin that contributed it.
- `require` of core packages is possible only for modules the browser seed
  provides (React, etc.) - keep runtime imports to a minimum.

**Why these client bundles are plain JavaScript, not TypeScript.** The format
above is the only one the harness serves: a single hand-written module-table
file per package, no build step. A TS pipeline would insert a compile between
every edit and the running GUI (there is no HMR unless a `pnpm run dev:web`
watcher from the harness repo runs), and would type against a client surface
that is still evolving. Plain JS + JSDoc keeps the edit -> restart loop instant
and the code greppable against the shipped core bundles.

## 4. The right bar (the pack owns it)

The GUI has a real right column: the conversation header's expand button
(`conversation.session.header.corner`) opens a per-session docking surface with
a tab strip, a "+" add control, splits and floating panels. Its strip starts
with the **Start** tab - the *guide* page, whose body lists one entry capsule
per registered tab type - and the **Files** tab with the session workspace tree.

**That bar is this pack's.** `dsh-rightbar` ships a byte-for-byte fork of the
shipped `@deepseek-ai/dsh-client-ui-sidebar-right` bundle (module-table id
rewritten to `dsh-rightbar`), and `dsh-rightbar-files` does the same for
`@deepseek-ai/dsh-client-ui-sidebar-files`. The master's bundle layer then
hard-disables the two core rows:

```yaml
- id: ui-sidebar-right
  disabled: true
- id: ui-sidebar-files
  disabled: true
- insert:
    - id: rightbar
      name: 'dsh-rightbar'
```

Why a fork: the pack can then change any part of the column (chrome, tab
handling, guide, Files tree) without editing an installed core file, and
without waiting for a new seam. The two mechanisms that make it safe:

- **Row disable is a supported patch form.** The CLI itself disables its
  telemetry row with exactly `{ id, disabled: true }` (see
  `resolveTelemetryPatch` in `dsh/lib/profile-boot-*.js`). A disabled row is not
  an active Loader entry, so `dsh-client-modules` never puts its client bundle
  in the boot graph - verified: the boot HTML lists `dsh-rightbar`,
  `dsh-rightbar-files` and `dsh-editor`, and **zero** occurrences of the two
  disabled packages.
- **The bar's runtime dependencies are static modules of the shell.** The Vite
  shell seeds `react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`,
  `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
  `@deepseek-ai/dsh-client-ui-primitives` and
  `@deepseek-ai/dsh-client-ui-dockkit` for every bundle
  (`staticModules()` in the frontend's index chunk), so a copied bundle keeps
  resolving them. Nothing else is required at runtime: a package's
  `dsh.client.inject` list is only an ordering hint, and the client graph walk
  skips a named dependency that is not in the graph - which is why the shipped
  `ui-sidebar-documentpreview` row (deliberately left enabled) still loads and
  still finds the `sidebarRightTabs` service, now provided by the pack.

The contract other plugins use is unchanged (that is the point of a
byte-for-byte fork) and is the seam the pack's own sub-plugins use:

```ts
ctx.sidebarRightTabs.register({
  id,            // this implementation's identity, unique; also the slot key
  kind,          // the tab kind (what openTab names)
  patterns?,     // dsh-resource:// addresses this type recognizes (omit for a page type)
  priority?,     // 'extension' | 'builtin' | 'fallback' (default: extension)
  canOpen?,      // veto an address the patterns matched
  title(address),// the chip text captured at open time
  guide?,        // entry capsules the "+" / Start page lists
})
```

- **Two-stage registration.** The definition above is stage one; stage two is
  the *keyed* body and title:
  `ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name, key: id, inject }, Body))`
  and the same for `sidebar.right.pane.tab.title`. A kind with no registrant
  renders the "nothing can view this yet" notice, so a missing body is a visible
  defect rather than an empty pane.
- **Addresses, not files.** Everything the column opens is an address:
  resources as `dsh-resource://<type>/...` (files are
  `dsh-resource://file/session/<sessionId>/<path>`), pages as
  `sidebar://<kind>`. A tab's `contentId` IS its address, which is what makes
  re-opening the same file reveal the same tab.
- **The "+" control opens the guide** (`openTab('guide', { revealIfOpened: false })`),
  and the guide renders `registry.guide()` - every registered type's `guide`
  entries, in `order`. Picking a capsule calls
  `tab.actions.openTab(entry.kind, { replaceTab: true })`.
- **Priority bands decide who draws a file.** `extension` (the default, meant
  for types from outside the product) outranks every `builtin` viewer and the
  `fallback` plain-text viewer. A third-party type therefore has to *veto* what
  it does not want in `canOpen`, or it silently takes files away from the
  shipped previews.
- **A body gets its runtime from the framework, not from props it invented:**
  `useTabInfo()` returns the tab record (`contentId`, `navigation.params`,
  `title`, `signal`, `actions`), and session-scoped seats additionally receive
  `sessionId` and the `useSessions` reader.

**Keeping the fork honest.** `scripts/sync-vendored.ps1` copies both core
bundles from the harness `node_modules` (profile first, then the npx cache),
rewrites their module ids, stamps a GENERATED banner and prints hashes;
`-Check` reports drift with a non-zero exit. The republished copies are
generated files - never hand-edit them, and review the diff after a harness-line
bump, because a fork does not track upstream by itself.

## 5. The Files tab (the pack's `dsh-rightbar-files`)

`dsh-rightbar-files` is the second half of the fork: the same bundle the product
ships as `@deepseek-ai/dsh-client-ui-sidebar-files`, with the core row disabled
and this one in its place. It registers the `files` tab kind (guide entry
`order: 10`) and lists the session workspace through the `remote.workspaceFiles`
Remote (`list(sessionId, path, signal)`), one level at a time; a file row calls
`tabActions.openResource(fileAddressFor(sessionId, root, path))`. Routing that
address to a viewer is the registry's job - which is exactly the hook §6 uses.

That Remote is read-only: `read`, `readBytes`, `readAll`, `readRelated`,
`stat`, `list`, `changes` - and **no mutation operation**. The editor's save
path therefore needs a route of its own (§6).

## 6. The editor tab type (dsh-editor)

A **sub-plugin** of the bar: one bundle, two halves, no core patches. Its client
half is hand-written (the pack's own code, not a fork); its Node half owns the
only host-side routes in the pack.

**Browser half** (`lib/client.js`) registers the type:

| Piece | Value |
|---|---|
| `id` | `dsh-editor` (also the slot key of its body and title) |
| `kind` | `editor` |
| `patterns` | `["dsh-resource://file/**"]` |
| `priority` | `extension` - text files open editable instead of in the shipped read-only preview |
| `canOpen` | session-scoped address, path stays inside the workspace, extension not owned by a shipped preview (md/markdown/html/images/pdf/office/archive/media/binary) |
| `guide` | one entry, `order: 20` (right after Files' 10): "Editor" -> creates an editor tab |
| body | `EditorView` for a file address, `FilePicker` for the page address `sidebar://editor` |
| title | the captured basename plus a dirty dot, fed by a module-level per-tab store |

Behaviours that follow from that table:

- Clicking a `.ts`, `.json`, `.py`, … anywhere the Sidebar opens files (the
  Files tree, a file link in the conversation) claims to this type and shows
  the editor. Re-opening the same address reveals the same tab.
- Clicking a `.md`, `.png`, `.pdf`, … is vetoed, so the shipped preview keeps
  it. Paths outside the session workspace (including `absolute/…` addresses,
  which carry no authorizing session) are vetoed too.
- "+" -> Start -> **Editor** creates the empty **page** tab, whose body is a
  workspace picker (`remote.workspaceFiles.list`, directories descend, ".."
  goes up). Picking a file calls
  `tab.actions.openResource(address, { replaceTab: tab.id })`, so the file
  replaces the empty tab instead of leaving it behind.

**Node half** (`lib/index.js`) owns the authenticated routes on the
`connection` service - the same mechanism the shipped session-log-export plugin
uses for its ZIP download:

| Route | Behavior |
|---|---|
| `GET /api/dsh-editor/file?session&path` | resolves the session's workspace root, realpath-containment inside it; strict UTF-8 decode + NUL rejection (`NOT_TEXT`); ≤ 2 MiB; returns `{text, version, mtimeMs, size}` |
| `PUT /api/dsh-editor/file` | same containment; atomic temp-file + rename; optimistic guard - the echoed `mtimeMs`/`size` must match or it answers `409 CHANGED_ON_DISK` instead of clobbering |
| `GET /api/dsh-editor/vendor` | streams the vendored CodeMirror 6 classic bundle (committed `lib/vendor/cm6.min.js`, generated from `vendor/entry.js`, see the package README) |

The session id in the URL is what the tab's address already carries; the
**host** resolves the workspace root - live session header first
(`ctx.get('sessions').get(id).header.cwd`), stored header second
(`ctx.get('sessionPersistence').stat(id).header.cwd`), a typed `NO_WORKSPACE`
failure otherwise - mirroring how `@deepseek-ai/dsh-api-workspace-files`
resolves its own reads. The client never names a root, and the row declares
only `inject: ["connection"]` so a missing optional service degrades instead of
blocking activation.

The plain-fs row deliberately avoids the tool-layer fs sandbox/policy state
and only ever touches paths the owner's own GUI asks for, inside the session's
own workspace.

**Lazy engine.** CodeMirror 6 is vendored ONCE as a classic IIFE
(`window.DSHEditorCM`) and fetched over the plugin's own route on the first
file open, so an idle GUI never pays for the editor. `lib/client.js` is
hand-written module-table code with **no build step**; only the CM6 artifact is
generated (when the version set changes).

## 7. The installer

`scripts/install-all.ps1` / `uninstall-all.ps1` (PowerShell 5.1, ASCII only)
are driven by `install.bat` / `uninstall.bat`.

- **Detection**: one target - `DSH_HOME` env, else `%USERPROFILE%\.dsh`; profile
  `web` (`-DshHome` / `-ProfileName` override both). `-Target` still exists but
  accepts only `web` and `cli`, and both mean the web profile, so a stale
  `-Target desktop` invocation fails loudly instead of silently doing nothing.
- **dsh/pnpm invocation**: every operation runs
  `npx --yes @deepseek-ai/dsh@<pinned>` (pinned in `.dsh-version.json`).
  pnpm is bootstrapped locally under `tools\pnpm<major>`: the script reads the
  profile's `node_modules\.modules.yaml`, picks the matching pnpm major, and
  exports `npm_config_virtual_store_dir_max_length` + the workspace-root-check
  opt-out (`npm_config_ignore_workspace_root_check=true`) because dsh profiles
  are pnpm workspace roots (`packages: [.]`).
  npm is invoked through `npm.cmd` explicitly (a `npm.ps1` resolution mangles
  `pkg@version` arguments).
  A native command's stderr (npm warnings do this constantly) becomes a
  terminating `NativeCommandError` under `$ErrorActionPreference = 'Stop'` the
  moment its output is merged, so every `dsh`/`npm` call runs with that
  preference relaxed and is judged by its exit code alone.
- **Idempotency**: bundles already in `dsh.profile.bundles` are skipped
  unless `-Force` **or the repo version changed**.
- **Dev sync**: `Get-EffectiveInstalledVersion` compares the repo
  `package.json` version against the version the installed package reports. A
  plain double-click of `install.bat` after a version bump therefore re-adds the
  bundle, so development changes actually reach the profile.
- **Live links**: the web profile installs all three bundles (`dsh-rightbar`,
  `dsh-rightbar-files`, `dsh-editor`) as `pnpm link:` junctions straight into
  this repo (`Test-LiveLink` detects this). Code edits then already apply - a
  restart of `npx @deepseek-ai/dsh web` plus a hard browser refresh is all it
  takes; the installer prints that instead of re-adding.
- **Fork re-sync**: `scripts/sync-vendored.ps1` is the installer's sibling for
  the two forked client bundles (§4). It is *not* run by `install.bat` - moving
  a fork forward is a reviewed change, not an install step.
- **Retired-name prune**: both scripts remove a profile's stale `dsh-focus`
  and `dsh-files` bundles (kept in `$legacyNames`) before installing, so an
  upgrade from the pack's own-Files era drops the old rows/dock instead of
  double-mounting. Add future removed/renamed packages to that list in both
  scripts.
- **Uninstall** removes the package and therefore its patch layer. Removing
  `dsh-rightbar` also removes the disables, so the shipped rows come back on the
  next boot.

## 8. Versioning and upgrade path

- `.dsh-version.json` pins the dsh line, the `vendoredFrom` line the fork was
  taken from, and per-package versions.
- Packages stay `-alpha.N` until the owner says "make it stable".
- When DSH publishes a newer line: bump the pin, run `sync-vendored.ps1` (then
  review the diff - a fork does not track upstream), re-install with `-Force`,
  and adapt the affected API seams. The seams most likely to change, in order:
  the right-bar tab registry shape (`register`/`openResource`/guide entries) and
  the keyed tab seats with their framework props (`useTabInfo`, `sessionId`,
  `useSessions`) - both of which this pack now owns, so a change there is a
  merge into the fork rather than a break - and, on the Node side, the route
  registration surface (`connection.fetch.register`, where a route must declare
  `requestBody` or its handler never runs) and the session-root lookup.

## 9. Troubleshooting quick table

| Symptom | Cause / action |
|---|---|
| Old panel still showing after edit | client bundle is read at boot; restart the app and HARD-refresh the browser (Ctrl+F5). The web profile is a live link, so no reinstall is needed |
| The right bar is missing entirely | the fork did not load: confirm the boot HTML lists `dsh-rightbar/client.js`, and that `dsh-rightbar`'s layer still disables `ui-sidebar-right` / `ui-sidebar-files` (a profile patch that re-enables them mounts two bars, which throws on the duplicate tab-type ids) |
| The bar is the shipped one, not the pack's | `dsh-rightbar` is not in `dsh.profile.bundles` (or the row id was renamed); re-run `install.bat`, then restart |
| Two Files panels / a stray dock after upgrading | the retired `dsh-files` (or `dsh-focus`) bundle is still in the profile; re-run `install.bat` (its prune removes both) |
| No "Editor" in the "+" / Start page | the client bundle did not activate: check the browser console for `[dsh-editor]`; a `sidebarRightTabs` service that never appears leaves activation pending |
| Editor says "Editor unavailable (HTTP 400)" on the engine | the Node route is missing `requestBody: 'buffered'`, so Connection's bridge throws before the handler runs and the web server answers a bare 400 |
| Clicking a file opens the read-only preview instead of the editor | the address was vetoed by `canOpen`: a preview-owned extension (md/html/image/pdf/…), a path outside the session workspace, or an `absolute/…` address |
| Editor tab says "Could not open the file" / `NO_WORKSPACE` | the session root could not be resolved (session not live and not persisted yet) or the path is outside the conversation folder; open the conversation once so its header is available |
| Save answers "Changed on disk" | the file moved under you; use **Reload** (take the disk copy) or **Save anyway** (overwrite it) in the banner |
| Fork drift after a harness update | `powershell -File scripts\sync-vendored.ps1 -Check` exits 1; run it without `-Check` and review the diff |
| Installer fails with `virtual-store-dir-max-length` | profile created by a different pnpm major; scripts auto-match - re-run installer |
| `-Target desktop` is rejected | intentional: DSH Desktop is no longer a target of this pack |
| `.ps1` parse error after editing | non-ASCII character crept in (smart quotes/dash); keep scripts ASCII-only |

See also: `docs/INSTALL.md` (human steps) and `docs/COMPATIBILITY.md`
(version matrix).
