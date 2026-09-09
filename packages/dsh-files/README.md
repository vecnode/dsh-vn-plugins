# dsh-files (alpha)

**Files** is a DeepSeek Harness Web UI plugin that adds a real right-hand
column **after** the chat column (never on top of it), mirroring the left
navigation panel. The panel shows the folder the current conversation works in
as an inline **tree**: click a folder and it expands in place, indented,
Claude-Code style, using the native DSH design tokens.

The dock is a small **tab host**: open panels show as Claude-style tabs in a
strip on top of the dock, and every tab has a close **x**. Files is the
built-in panel; since alpha.12 the host also accepts **external panels** —
`dsh-editor` (the Editor tab) registers itself through the window host API this
plugin publishes (`window.__dshFilesHost`, event `dsh-files:host-ready`), so
each plugin keeps its own bundle while sharing one dock, tab strip, resize grip
and persistence. The content under the tab strip switches per **active** tab:
Files' own chrome is the `files` section; a registered foreign panel gets a
lazily mounted section that fills the same area. Files' browsing behavior is
unchanged — and with the Editor installed, **double-clicking a file row** hands
that file to the Editor (folders still expand on a single click).

Opening is **button-driven**: a **"Files"** trigger sits in the session header
beside the shipped **"Session log"** capsule (the core
`conversation.session.header.utilities` seat). Click it to open the Files
panel on the right; click it again, or the tab's **x**, and the panel
disappears — the chat reclaims the space. There is **no collapsed rail** state
anymore: the panel is expanded or gone, and the trigger button shows a pressed
state while it is open. The divider between the chat and the panel is a
**drag handle**: pull it to resize, and the open tab layout, panel width and
the hidden-file toggle survive app restarts (`localStorage` key
`dsh-files.v1`).

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

> How the space is reserved (alpha.10): Files reserves its **own** strip inside
> the core AppFrame instead of borrowing the core "details" grid track. The
> frame gets `padding-right` sized from a CSS variable (`--dsh-files-w`, set
> on the frame, box-sizing border-box), so the sidebar / conversation / core
> details column are squeezed left and the chat is never overlapped. The dock
> is sized from the same variable, so the strip the chat concedes always
> equals the panel that fills it. Changes snap (no CSS transitions):
> open/closed state flips the dock display together with the variable, so the
> chat is never overlapped mid-change. Files never calls
> `ctx.layout.openDetails()`, so the core empty "Details" placeholder can not
> pop up behind the panel, and there is no state machine fighting the core
> layout service. Since the `shell.overlay` seat registration is not reliable
> on rc.1, the plain-DOM dock is the sole renderer of the panel: it starts on
> `<body>`, waits for / re-parents itself into the `[data-shell-overlay]`
> layer when the core AppFrame commits, then tags the frame
> (`data-dsh-files-pad`) and sizes the strip. Resizing writes only the CSS
> variable, and the width goes up to ~1040px (window permitting) while the
> conversation keeps its 640px minimum. The **trigger button**, by contrast,
> is a real React seat entry in the core
> `conversation.session.header.utilities` list seat — the same seat that
> carries the shipped "Session log" capsule — so it renders reliably inside
> the React header (this seat is core-owned and proven, unlike the empty
> `shell.overlay` panel seat).

> History: through alpha.9 this plugin was **dsh-focus** with an always-visible
> collapsed **edge rail**. alpha.10 renamed it to **dsh-files** and moved the
> open/close gesture into the session header, removing the rail entirely.

## What the panel shows

- **Tab strip**: one Claude-style tab per open panel (`Files`, and `Editor`
  when dsh-editor is installed) with a close **x**; the `alpha` badge sits at
  the strip's right so a freshly loaded bundle is easy to verify. The active
  tab's x (or pressing its header trigger while open) hides the whole dock when
  it was the last one open.
- **File rows** can be opened: with dsh-editor installed, double-clicking a
  file row opens it in the Editor tab (text-only files; binary is refused there).
  Folder rows still expand in place on a single click.
- **Toolbar** (Claude-Code look): a **search input** that filters the
  currently loaded rows client-side (name/path substring, instant) and a
  **refresh** button that re-lists the current folder and every expanded
  subfolder in place.
- **Body**: the folder's entries as a **tree** —
  folders first with a small caret; **click a folder and it expands inline
  under itself** (indented, deeper folders expand the same way, click again
  to collapse). Files have no glyph and folders are not tinted. **Dotfiles
  are shown by default** — `.gitignore`, `.dsh-version.json`, hidden folders
  — dimmed, with a footer **"Hidden files"** toggle to turn them off. The
  footer counter follows the search filter when one is active.
- The listing never silently blanks: `Starting the folder service…`
  (namespace not mounted yet — retried), `Loading folder…`, a visible error,
  or "No files to show here" with a reason.
- Excluded by the host, whatever the toggle: `.git`, `node_modules`, `dist`,
  `build`, `out`, `coverage`, `target`, `.next`, `.nuxt`, `.turbo`, `.venv`,
  `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.gradle`.

## How the folder listing works

Everything is read through client services and Remotes that already ship with
the web composition — no server-side code in this plugin:

| Concern | Mechanism | Why |
|---|---|---|
| Where the panel lives | geometry: own reserved right strip — `padding-right` on the core AppFrame driven by one CSS variable; surface: a plain-DOM dock that re-parents itself into the `[data-shell-overlay]` layer when it commits | The chat column really shrinks; the core "Details" column is never opened by Files, so the empty core placeholder can not appear; the panel's left-edge grip resizes the strip |
| Opening / closing | a React **"Files" trigger** registered in the core `conversation.session.header.utilities` seat (`ctx.slots.inject`), right of the shipped "Session log" capsule | The panel has no rail or in-dock close; the header button is the single trigger, and more plugins can register their own header triggers / tabs later |
| Tabs | `createTabHost()` in `lib/client.js` keeps the open-set, order and active id; the DOM tab strip renders from it; each tab carries a close-x | Files is the only panel today, but adding one more descriptor + trigger gives a second Claude-style tab |
| Resizing / persistence | no public width setter in `ctx.layout` → the dock writes the CSS variable only; state kept in `localStorage` (`dsh-files.v1`) | Width is clamped to ~1040px max (subject to window space) with the conversation kept ≥640px; open tabs, width and the hidden toggle survive restarts |
| Folder contents | the `remote.fileReferences` namespace (`ctx.remote.fileReferences.list`) | Declared in `inject` like core `ui-reference` does; re-resolved on every refresh with a `waiting` retry phase, because the namespace is a service that can mount after Files activates. Expanded tree folders list through the same engine (`face.loadPath`) |
| Rows cap | `cordis.patch.yml` restates the `file-reference-local` row with `maxResults: 2000` | The stock row caps every answer at 20 rows, which would truncate a real folder listing |
| Search | toolbar input filters the **currently loaded** rows client-side | Instant and safe; whole-workspace fuzzy search is a follow-up (the same remote already supports bare-query search) |

## Layout

- `cordis.patch.yml` — bundle layer: restates `file-reference-local`
  (`maxResults: 2000`) and inserts the `files` row.
- `lib/client.js` — browser half: tab host (open/active set), files store
  (phases, dotfiles, retry, refresh/loadPath), header trigger (React seat),
  DOM dock (tab strip, toolbar, tree rows, footer, drag-resize, persistence).
- `lib/index.js` — Node half (no-op row so the client bundle ships).

## Install / uninstall

Use the repo's `install.bat` / `uninstall.bat` (both targets) or the manual
path in `docs/INSTALL.md`. The installer prunes the legacy `dsh-focus` bundle
name so an upgrade from alpha.9 does not double-mount.
