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
| web / CLI (`npx @deepseek-ai/dsh web`) | `DSH_HOME` env, else `~/.dsh` (Windows: `%USERPROFILE%\.dsh`) | `web` | the only target; the profile holds its own pnpm modules (store v3, virtual-store max length 120, pnpm 9) |

DSH Desktop (the Electron app's harness home under
`%APPDATA%\dsh-desktop\harness`) is **deliberately not supported**: it launches
a frozen generation snapshot of its plugin set that only refreshes on app
relaunch, which made every code change a two-step dance. The installer, the
uninstaller and their docs target the web profile alone. Profiles that still
carry this pack's bundles from that era can be cleaned with
`uninstall.bat -DshHome "%APPDATA%\dsh-desktop\harness"` (or
`./uninstall.sh -DshHome ...`) if it is ever needed - but nothing in this repo
does that automatically any more.

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
packages/dsh-modal/               # sub-plugin: the shared dialog surface
  package.json        # dsh.bundle + dsh.client
  cordis.patch.yml    # inserts the 'modal' row (nothing else patched)
  lib/index.js        # Node half: no-op row (the overlay is browser-only)
  lib/client.js       # browser half: body-level overlay + the `modals` client service
packages/dsh-themes/              # sub-plugin: the header's Themes control
  package.json        # dsh.bundle + dsh.client
  cordis.patch.yml    # inserts the 'themes' row (nothing else patched)
  lib/index.js        # Node half: no-op row (the control is browser-only)
  lib/client.js       # browser half: the Light/Dark/System button over `ctx.get('theme')`
packages/dsh-open-in-app/         # the file-manager half of the Open In button
  package.json        # dsh.bundle + dsh.client (forks the shipped client bundle)
  cordis.patch.yml    # disables ui-open-in-app, inserts 'native-open-in-app'
  lib/index.js        # Node half: POST /api/dsh-open-in-app/open (node builtins only)
  lib/client.js       # GENERATED + PATCHED fork of the shipped open-in-app client
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
    exports.inject = ["slots", "sidebarRightTabs"];
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
  `dsh-rightbar` (the fork of `@deepseek-ai/dsh-client-ui-sidebar-right`).
- A service another bundle provides can also be resolved **lazily, at use time**,
  when a hard dependency would be wrong: `dsh-editor` reads `modals` only when a
  save-as dialog is actually needed, so it keeps working (browser `prompt`
  fallback) on a profile that never installed `dsh-modal`.
- Registration is disposed through `ctx.effect(() => disposer, label)`: a tab
  type lives exactly as long as the plugin that contributed it.
- `require` of core packages is possible only for modules the browser seed
  provides (`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`,
  `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
  `@deepseek-ai/dsh-client-ui-slots`, `-ui-primitives`, `-ui-dockkit`).
  `react-dom/client`'s `createRoot` is what lets `dsh-modal` own a body-level
  overlay without occupying a slot.

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
| `canOpen` | session-scoped address, path stays inside the workspace, extension not owned by a shipped preview (html/images/pdf/office/archive/media/binary) - **Markdown is claimed** since alpha.6: it is text, and the toolbar hands it to the rendered view on demand |
| `guide` | one entry, `order: 20` (right after Files' 10): "Editor" -> creates an editor tab |
| body | `EditorView` for a file address, and the same `EditorView` with `file: null` for the page address `sidebar://editor` (a blank, unnamed document) |
| title | the label the surface last set (the file name, adopted or on the record) or the captured basename, plus a dirty dot, fed by a module-level per-tab store |

Behaviours that follow from that table:

- Clicking a `.ts`, `.json`, `.py`, `.md`, … anywhere the Sidebar opens files
  (the Files tree, a file link in the conversation) claims to this type and shows
  the editor. Re-opening the same address reveals the same tab.
- Clicking a `.png`, `.pdf`, `.html`, … is vetoed, so the shipped preview keeps
  it. Paths outside the session workspace (including `absolute/…` addresses,
  which carry no authorizing session) are vetoed too.
- **Markdown is editable, and `Preview` is the way back** (alpha.6). The toolbar
  button (shown only while an `md`/`markdown` file is open) asks the right bar's
  controller for `openResource(address, { kind, replaceTab: tabId })`, where
  `kind` is **the kind the shipped document preview registered under, read from
  the tab-type registry** (never hardcoded), so the rendered document takes the
  editor tab's place and the pair cannot drift from the file. It must be the
  controller (`ctx.get('sidebarRight')`, resolved lazily), not the tab record's
  `openResource` action: that action drops `options.kind`, and the registry's
  ranking would hand the address straight back to this `extension`-band type. The
  hand-off refuses while the document is dirty - the preview reads the file from
  disk, and showing the older text silently would be a lie.
- "+" -> Start -> **Editor** creates the empty **page** tab, whose body is a
  blank CodeMirror document - nothing is read from disk, and there is no file
  browser inside the tab. **Save** (or Ctrl+S) on that document opens the shared
  dialog (`dsh-modal`) for a file name **with its extension**, `PUT`s it with
  `create: true` into the session workspace root (the folder the tab was opened
  in), and then decides the tab's fate from the SAME ranking a Files-tree click
  uses (`canOpenFile(address)`): a text/code file the editor claims is handed to
  `tab.actions.openResource(address, { replaceTab: tab.id })`, so the record
  becomes that file's tab (restorable, chip named from the record), while an
  extension a shipped preview owns **stays in the editor surface** with the file
  adopted and the chip label set from the per-tab store - because the preview
  cannot edit the file and this tab is the only place that can.

**Node half** (`lib/index.js`) owns the authenticated routes on the
`connection` service - the same mechanism the shipped session-log-export plugin
uses for its ZIP download:

| Route | Behavior |
|---|---|
| `GET /api/dsh-editor/file?session&path` | resolves the session's workspace root, realpath-containment inside it; strict UTF-8 decode + NUL rejection (`NOT_TEXT`); ≤ 2 MiB; returns `{text, version, mtimeMs, size}` |
| `PUT /api/dsh-editor/file` | same containment; atomic temp-file + rename; optimistic guard - the echoed `mtimeMs`/`size` must match or it answers `409 CHANGED_ON_DISK` instead of clobbering |
| `PUT /api/dsh-editor/file` with `{create: true}` | **create** a new file: the PARENT folder must exist inside the workspace and is realpath-checked (a symlinked folder cannot smuggle the write out), the target must not exist (`409 EXISTS`), and the publish is create-exclusive (hard link, then a `COPYFILE_EXCL` copy fallback) so a create never replaces a file the user did not open |
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

**Color scheme.** The editor is the one surface that cannot simply read the
`--dsw-*` tokens: CodeMirror wants a palette of its own, and oneDark paints an
opaque dark canvas no token can lighten. The surface therefore configures
**oneDark only while the app is dark** and a transparent light layer otherwise,
inside a CodeMirror `Compartment`, and it re-configures on the fly when the
appearance flips. The text colour is `--dsw-alias-label-primary` in both modes,
which is what keeps a document with **no syntax language** (`.ps1`,
`.gitignore`, `.txt` — its colour comes from that token, not from a highlight
style) readable; before alpha.5 it painted the light theme's near-black text on
oneDark's dark canvas. Scheme truth order: the shipped
`@deepseek-ai/dsh-client-ui-theme` snapshot (`active.colorScheme`, resolved
lazily through `ctx.get('theme')` and followed via its `theme/change` event),
else the `body[data-ds-dark-theme]` marker ui-layout writes (also observed, for
a profile where ui-theme never lands), else `prefers-color-scheme`, else dark.
The header control that switches the preference itself is §8.

## 7. The shared dialog surface (dsh-modal)

Alpha.4 gave the editor a save-as dialog, and the same dialog is what any other
plugin of this pack (or a deployment's own) should reach for, so it lives in its
own bundle instead of inside the editor. `dsh-modal` provides one client service:

```js
const modals = ctx.get('modals')          // provided with ctx.reflect.provide
await modals.open({ title, message, fields, validate, submit })
await modals.alert('Saved.')              // single-button acknowledgement
if (await modals.confirm({ message })) {} // true only on the confirm button
const name = await modals.prompt({ label: 'Name' })
```

Design points worth keeping:

- **One dialog at a time, FIFO.** A second `open()` while a dialog is up is
  queued and shown when the first settles, so two racing callers cannot replace
  each other's UI. `open()` resolves with `null` on cancel, otherwise the field
  values (or whatever `submit` returned).
- **`submit` runs while the dialog is open.** This is the whole point: work that
  can fail (create a file, rename, POST) reports its failure IN the dialog, the
  user keeps everything typed, and only a success closes it. A thrown error is
  shown verbatim; `validate` covers the cheap, synchronous checks.
- **No slot, no ordering.** The host creates its own container on
  `document.body` and renders it with `react-dom/client`'s `createRoot` (both
  seeded by the shell). There is no layout contribution and no inject edge, so
  the surface is callable from every plugin at any point in the boot.
- **Escape belongs to the dialog** while it is up: the keydown listener runs in
  the capture phase and stops propagation, so the pane underneath never also
  reacts to the same key. Mask click and Cancel cancel; none of them fires while
  `submit` is in flight.

## 8. The Themes control (dsh-themes)

The conversation header's right-hand group is a slot list
(`conversation.session.header.utilities`): the shipped **Open In…** split button
registers there at `order: -10` and the Session-log download at the default `0`.
`dsh-themes` is one more occupant at **`order: -20`**, so it renders first —
immediately left of Open In — and nothing shipped is patched or reordered.

| Piece | Value |
|---|---|
| `id` | `dsh-themes` (the occupant's slot id) |
| slot | `conversation.session.header.utilities` (list, session scope) |
| `order` | `-20` — first in the group, left of Open In (-10) |
| body | one icon button (28×28, 28px radius, 6px padding, 15px glyph — the header's own icon-button dress) opening a `Menu` of Light / Dark / System |
| state | the shipped `theme` client service's snapshot, read through `ctx.get('theme')` |
| write | `theme.setTheme(id)` — the same call the Settings → General → Appearance row makes |

**Why a thin control and not a second theme system: the preference has one
owner.** `@deepseek-ai/dsh-client-ui-theme` (row `ui-theme` in the web roster)
persists the choice in the `ui-theme` settings namespace, resolves `system`
through `prefers-color-scheme`, and publishes immutable snapshots; ui-layout's
presenter applies each snapshot to the document
(`body[data-ds-dark-theme]`, `color-scheme`, the `--dsw-*` overrides). A private
copy of that preference would duplicate the persistence path and could drift
from Settings, so this package reads and writes the same service instead.

Design points worth keeping:

- **The service is optional and resolved lazily.** `theme` is read with
  `ctx.get('theme')` at use time and is NOT in the exported `inject` list — the
  same rule `dsh-editor` follows for `modals`. A profile that never mounts
  ui-theme keeps its header: the button renders disabled with "The theme service
  is unavailable", and a write throws instead of silently doing nothing.
- **Live state.** The control subscribes to ui-theme's `theme/change` event, so
  a switch made in Settings (or an OS flip while the preference is `system`)
  repaints the glyph; the store also reads a written value back after `setTheme`
  so the control cannot lag a synchronous publish, and a microtask after boot
  picks the snapshot up when ui-theme provides the service a tick late. It
  observes no DOM: the resolved palette is ui-layout's business, not this
  control's.
- **The glyph follows the persisted preference**, not the resolved palette:
  `System` stays visible as the choice it is, which is what the Settings cubes
  highlight as well.
- **Only seeded modules at runtime.** The bundle requires `react` and
  `@deepseek-ai/dsh-client-ui-primitives` (`Menu`, `Tooltip` and the three
  appearance glyphs), so it adds one entry to the boot graph and no new module
  resolution.

**The Markdown paper (alpha.2).** The same package carries the pack's appearance
*overrides*: rules that hold one surface on a fixed palette whatever the app
theme is. The first is the rendered Markdown view, which the user wants white in
either appearance.

The shipped document preview draws Markdown into a container marked
`data-document-markdown` and paints it from `--dsw-*` tokens. ui-theme declares
the light palette on `body{}` and **overrides** it on `body[data-ds-dark-theme]{}`
(the static palette too: 73 `--dsw-static-*`, 79 `--dsw-alias-*`, and shiki.css's
nine literal `--shiki-token-*`), so a subtree cannot un-dark itself by
referencing the tokens - it inherits the dark values. The paper is therefore one
injected rule that **re-declares ui-theme's own light declarations** on that
container and paints it white:

```css
body [data-document-markdown]{ /* the theme's light layer, verbatim */ background:#fff; … }
```

- **Read, not hardcoded.** The light layer is copied at boot out of the theme
  package's own stylesheets (`document.styleSheets` entries whose
  `data-plugin`/`data-pluginCss` starts with `@deepseek-ai/dsh-client-ui-theme`,
  every top-level `:root` / `body` rule that is not the dark one), so a palette
  change on a harness bump carries over instead of freezing today's hex values.
  The read enumerates the rule's declared custom properties and falls back to the
  rule's text where an engine does not expose them - either path yields the same
  declarations.
- **All or nothing.** If nothing is readable, nothing is injected: forcing white
  without the light tokens would paint light text on a white page, which is worse
  than leaving the view on the app theme.
- **Scoped to the rendered document.** Chat Markdown and every other surface keep
  following the app theme; a second selector (`[data-textpreview-body]` matched
  with `:has([data-document-markdown])`) paints the preview's own scrollport
  white too, so a short document does not sit on the dark canvas underneath
  (unsupported `:has()` simply drops that one rule). Because
  `--dsl-code-block-*` and `--shiki-*` resolve *inside* the document (the block
  declares them with `var()` on its own element), the copied tokens give the code
  blocks, inline code, links and lists their light styling for free - no second
  palette for those.
- **Kept current.** Installed at boot, on the tick after it (ui-theme's sheets may
  land late), and again on every `theme/change` (a palette swap re-registers the
  sheets); the style tag is reused, so repeated installs are idempotent.

The way to this view for a Markdown file is the editor's **Preview** button (§6).

## 9. The file-manager half of Open In (dsh-open-in-app)

The Session header's **"Open In…"** split button comes from the shipped
`@deepseek-ai/dsh-client-ui-open-in-app` + `@deepseek-ai/dsh-host-open-in-app`
pair. Its file-manager entries (File Explorer / Finder / Files) are opened by the
host through the OS shell's *open verb* - `Invoke-Item` inside a spawned
`powershell.exe` on Windows - which is a fire-and-forget hand-off: the route
reports a successful launch as soon as that helper exits, whatever the desktop
did with it. On a host where the hand-off goes nowhere, the button simply does
nothing.

Fixing that means changing *which command runs*, and the shipped host row exposes
no seam for it (its catalog is compile-time, its config carries only three
timeouts, and a second `webServer` registration for the same path throws). The
pack therefore does what it does for the bar: **fork the client bundle and
disable the shipped row.**

- `dsh-open-in-app/lib/client.js` is the shipped browser bundle with the module
  id rewritten and **two patches** applied by `scripts/sync-vendored.ps1`: a
  constant for the pack route + the file-manager id set, and the single line in
  `launch()` that chooses a route. Everything else - the button, the menu, the
  remembered choice, the icons, the apps/icon routes - is the shipped code, so
  editors, Git GUIs and terminals keep going through the shipped host row
  (which stays mounted and untouched).
- `dsh-open-in-app/lib/index.js` is the pack's own Node half: one authenticated
  route, node builtins only, that spawns the OS file browser **directly** -
  `%SystemRoot%\explorer.exe` (absolute, so PATH cannot shadow it; Explorer's
  delegated exit 1 counts as handed over), `open` on macOS, `xdg-open` on Linux,
  and `explorer.exe` over a `wslpath -w` translation under WSL. A short watch
  window turns an early spawn error or nonzero exit into a real HTTP 502 - which
  the button paints as its error state - instead of another silent success.
- The route repeats the shipped fence: browser authentication and the
  Host/Origin check come from registering through `connection.fetch`, and the
  body is validated at the wire (JSON, a known file-manager id, an absolute path
  that names an existing directory). The launcher only ever spawns an argv array.

Because the fork is patched rather than copied byte-for-byte, the patch list is
data in `sync-vendored.ps1`: a harness bump that moves the patched code fails the
re-sync loudly instead of shipping a fork that silently lost its behavior, and
the generated banner lists the applied patches.

## 10. The installer

`scripts/install-all.ps1` / `uninstall-all.ps1` are **OS-neutral PowerShell**
(ASCII only) and run on Windows PowerShell 5.1 and on PowerShell 7+ (`pwsh`)
alike. The entry points are one pair per platform, each a thin wrapper over the
same script: `install.bat` / `install.sh` (root, friendlier: they add `-Force`
unless the caller already passed it) and the console twins
`scripts/install-all.bat` / `.sh`. `scripts/sync-vendored.ps1` follows the same
rule.

- **Detection**: one target - `DSH_HOME` env, else `~/.dsh`; profile `web`
  (`-DshHome` / `-ProfileName` override both). `-Target` still exists but accepts
  only `web` and `cli`, and both mean the web profile, so a stale
  `-Target desktop` invocation fails loudly instead of silently doing nothing.
- **Platform facts**: one block resolves the host once -
  `$PSVersionTable.PSEdition` plus the (5.1-absent, so guarded) `$IsWindows` /
  `$IsMacOS` variables - and derives the path separator, the directory separator,
  the home directory (`HOME`, else `USERPROFILE`, else the profile-folder API) and
  each tool's name (`npx.cmd` / `npm.cmd` / `pnpm.cmd` on Windows, bare names
  elsewhere) through `Get-ToolPath` / `Get-ToolNames`. Every path is built with
  `Join-Path`; nothing hardcodes `\`, `%USERPROFILE%` or `powershell.exe`.
- **dsh/pnpm invocation**: every operation runs
  `npx --yes @deepseek-ai/dsh@<pinned>` (pinned in `.dsh-version.json`).
  pnpm is bootstrapped locally under `tools/pnpm<major>`: the script reads the
  profile's `node_modules/.modules.yaml`, picks the matching pnpm major, and
  exports `npm_config_virtual_store_dir_max_length` + the workspace-root-check
  opt-out (`npm_config_ignore_workspace_root_check=true`) because dsh profiles
  are pnpm workspace roots (`packages: [.]`). The bootstrapped pnpm is taken from
  `node_modules/.bin` (`pnpm.cmd` on Windows, `pnpm` elsewhere) and prepended to
  `PATH` with `[System.IO.Path]::PathSeparator`.
  npm is invoked through the `npm.cmd` spelling on Windows (a `npm.ps1`
  resolution mangles `pkg@version` arguments) and as `npm` elsewhere.
  A native command's stderr (npm warnings do this constantly) becomes a
  terminating `NativeCommandError` under `$ErrorActionPreference = 'Stop'` the
  moment its output is merged, so every `dsh`/`npm` call runs with that
  preference relaxed and is judged by its exit code alone.
- **Idempotency**: bundles already in `dsh.profile.bundles` are skipped
  unless `-Force` **or the repo version changed**.
- **Dev sync**: `Get-EffectiveInstalledVersion` compares the repo
  `package.json` version against the version the installed package reports. A
  plain `install.bat` / `./install.sh` after a version bump therefore re-adds the
  bundle, so development changes actually reach the profile.
- **Live links**: the web profile installs every bundle (`dsh-rightbar`,
  `dsh-rightbar-files`, `dsh-editor`, `dsh-modal`, `dsh-open-in-app`) as
  `pnpm link:` junctions straight into this repo (`Test-LiveLink` detects this,
  comparing paths case-insensitively on Windows and case-sensitively elsewhere).
  Code edits then already apply - a restart of `npx @deepseek-ai/dsh web` plus a
  hard browser refresh is all it takes; the installer prints that instead of
  re-adding.
- **Fork re-sync**: `scripts/sync-vendored.ps1` is the installer's sibling for
  the three forked client bundles (§4, §9). It is *not* run by the installers -
  moving a fork forward is a reviewed change, not an install step. Its candidate
  roots cover the profile, the Windows npm cache (`%LOCALAPPDATA%`/`%APPDATA%`),
  `~/.npm/_npx`, and the POSIX global module directories.
- **Retired-name prune**: both scripts remove a profile's stale `dsh-focus`
  and `dsh-files` bundles (kept in `$legacyNames`) before installing, so an
  upgrade from the pack's own-Files era drops the old rows/dock instead of
  double-mounting. Add future removed/renamed packages to that list in both
  scripts.
- **Uninstall** removes the package and therefore its patch layer. Removing
  `dsh-rightbar` also removes the disables, so the shipped rows come back on the
  next boot.

## 11. Versioning and upgrade path

- `.dsh-version.json` pins the dsh line, the `vendoredFrom` line the fork was
  taken from, and per-package versions.
- Packages stay `-alpha.N` until the owner says "make it stable".
- When DSH publishes a newer line: bump the pin, run `sync-vendored.ps1` (then
  review the diff - a fork does not track upstream), re-install with `-Force`,
  and adapt the affected API seams. The seams most likely to change, in order:
  the right-bar tab registry shape (`register`/`openResource`/guide entries) and
  the keyed tab seats with their framework props (`useTabInfo`, `sessionId`,
  `useSessions`) - both of which this pack now owns, so a change there is a
  merge into the fork rather than a break - the patched `launch()` of the
  open-in-app client bundle (§9, the re-sync fails loudly when it moves), and, on
  the Node side, the route registration surface (`connection.fetch.register`,
  where a route must declare `requestBody` or its handler never runs) and the
  session-root lookup.

## 12. Troubleshooting quick table

| Symptom | Cause / action |
|---|---|
| Old panel still showing after edit | client bundle is read at boot; restart the app and HARD-refresh the browser (Ctrl+F5). The web profile is a live link, so no reinstall is needed |
| The right bar is missing entirely | the fork did not load: confirm the boot HTML lists `dsh-rightbar/client.js`, and that `dsh-rightbar`'s layer still disables `ui-sidebar-right` / `ui-sidebar-files` (a profile patch that re-enables them mounts two bars, which throws on the duplicate tab-type ids) |
| The bar is the shipped one, not the pack's | `dsh-rightbar` is not in `dsh.profile.bundles` (or the row id was renamed); re-run the installer (`install.bat` / `./install.sh`), then restart |
| Two Files panels / a stray dock after upgrading | the retired `dsh-files` (or `dsh-focus`) bundle is still in the profile; re-run the installer (its prune removes both) |
| No "Editor" in the "+" / Start page | the client bundle did not activate: check the browser console for `[dsh-editor]`; a `sidebarRightTabs` service that never appears leaves activation pending |
| Editor says "Editor unavailable (HTTP 400)" on the engine | the Node route is missing `requestBody: 'buffered'`, so Connection's bridge throws before the handler runs and the web server answers a bare 400 |
| Clicking a file opens the read-only preview instead of the editor | the address was vetoed by `canOpen`: a preview-owned extension (md/html/image/pdf/…), a path outside the session workspace, or an `absolute/…` address |
| Save-as says the name is taken / the folder is missing | `409 EXISTS` (pick another name - the dialog stays open with what you typed) or `404 NO_FOLDER` (a subfolder path must already exist; nothing creates directories) |
| A `.md` saved from the editor did not become a tab of its own | intentional: a preview-owned extension keeps the editor surface (the preview cannot edit it), so the chip carries the file name through the tab-title store while the tab record stays `sidebar://editor` |
| Save-as shows no dialog, only a browser prompt | `dsh-modal` is not mounted, so the editor fell back to `window.prompt`; re-run the installer with `-Force` and restart to add the bundle |
| The "Open In…" File Explorer entry still does nothing | the forked row is not the one running: confirm the boot HTML lists `dsh-open-in-app/client.js` and not `@deepseek-ai/dsh-client-ui-open-in-app`, and that `dsh-open-in-app`'s layer still disables `ui-open-in-app` |
| Editor tab says "Could not open the file" / `NO_WORKSPACE` | the session root could not be resolved (session not live and not persisted yet) or the path is outside the conversation folder; open the conversation once so its header is available |
| Save answers "Changed on disk" | the file moved under you; use **Reload** (take the disk copy) or **Save anyway** (overwrite it) in the banner |
| Code text is black-on-dark in the light theme | the editor did not follow the scheme: confirm the bundle is alpha.5+ (`dsh-editor` prints its version in the tab's file bar) and that ui-layout still writes `body[data-ds-dark-theme]` |
| No Themes button in the header | `dsh-themes` is not mounted (a new package needs one install run: `install.bat` / `./install.sh`, or `-Force`), or the row did not land: check the console for `[dsh-themes]` |
| The Themes button is greyed out | the `theme` service never appeared, so `@deepseek-ai/dsh-client-ui-theme` (row `ui-theme`) is not in the boot graph; the tooltip says "The theme service is unavailable" |
| Fork drift after a harness update | `scripts/sync-vendored.ps1 -Check` exits 1; run it without `-Check` and review the diff |
| Installer fails with `virtual-store-dir-max-length` | profile created by a different pnpm major; scripts auto-match - re-run installer |
| `-Target desktop` is rejected | intentional: DSH Desktop is no longer a target of this pack |
| `.ps1` parse error after editing | non-ASCII character crept in (smart quotes/dash); keep scripts ASCII-only |
| `./install.sh: Permission denied` | the executable bit was lost in a copy: `chmod +x install.sh uninstall.sh scripts/*.sh` |
| `./install.sh` reports that a command is missing | PowerShell 7 is not installed: `brew install --cask powershell` (macOS) or the package for your distro - https://aka.ms/powershell |
| A path with a backslash fails on macOS/Linux | a Windows-only path crept into a `.ps1`: build paths with `Join-Path` and take the separator from `[System.IO.Path]` |

See also: `docs/INSTALL.md` (human steps) and `docs/COMPATIBILITY.md`
(version matrix).
