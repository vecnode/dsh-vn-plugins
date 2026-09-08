# dsh-focus (alpha)

**Focus** is a DeepSeek Harness Web UI plugin that adds a real right-hand
column **after** the chat column (never on top of it), mirroring the left
navigation panel. The panel shows the folder the current conversation works in
as an inline **tree**: click a folder and it expands in place, indented,
Claude-Code style, using the native DSH design tokens.

Collapsing Focus hands the space back to the chat and Focus stays visible as a
slim **edge rail** on the right (like the collapsed left sidebar) with an
expand control — it is never closed away and there is no close (x) button.
The rail keeps a fixed 56px strip reserved (the chat column is squeezed, never
covered), and it is the **only** thing shown while collapsed — the dock is
display:none, so no second ghost bar appears. The divider between the chat and
the panel is a **drag handle**: pull it to resize the panel, and the
open/collapsed state, panel width and the hidden toggle survive app restarts
(`localStorage`).

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

> How the space is reserved (alpha.9): Focus reserves its **own** strip inside
> the core AppFrame instead of borrowing the core "details" grid track. The
> frame gets `padding-right` sized from a CSS variable (`--dsh-focus-w`, set on
> the frame, box-sizing border-box), so the sidebar / conversation / core
> details column are squeezed left and the chat is never overlapped. The dock
> is sized from the same variable, so the strip the chat concedes always
> equals the panel that fills it. Changes snap (no CSS transitions):
> open/closed state flips the dock↔rail display together with the variable, so
> the chat is never overlapped mid-change. Focus never calls
> `ctx.layout.openDetails()`, so the core empty "Details" placeholder can not
> pop up behind the panel, and there is no state machine fighting the core
> layout service (which also means the collapsed rail's expand control can not
> be raced back to closed). Since the `shell.overlay` seat registration is not
> reliable on rc.1, the plain-DOM panel is the sole renderer: it starts on
> `<body>`, waits for / re-parents itself into the `[data-shell-overlay]`
> layer when the core AppFrame commits, then tags the frame
> (`data-dsh-focus-pad`) and sizes the strip. Resizing writes only the CSS
> variable, and widths stay inside the core details contract range
> (300…520px) while the conversation keeps its 640px minimum.

## What the panel shows

- Header: title **Focus**, the `alpha` badge, and a panel-outline control
  that **collapses** the column to the edge rail (expand control on the rail
  reopens it). Both controls carry `aria-expanded`.
- Body: the folder path on top, then the folder's entries as a **tree** —
  folders first with a small caret; **click a folder and it expands inline
  under itself** (indented, deeper folders expand the same way, click again
  to collapse). Files have no glyph and folders are not tinted. **Dotfiles
  are shown by default** — `.gitignore`, `.dsh-version.json`, hidden folders
  — dimmed, with a footer **"Hidden files"** toggle to turn them off.
- The listing never silently blanks: `Starting the folder service…`
  (namespace not mounted yet — retried), `Loading folder…`, a visible error,
  or "No files to show here" with a reason. A footer counter shows the item
  count.
- Excluded by the host, whatever the toggle: `.git`, `node_modules`, `dist`,
  `build`, `out`, `coverage`, `target`, `.next`, `.nuxt`, `.turbo`, `.venv`,
  `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.gradle`.

## How it works (no custom host APIs)

| Need | Uses | Notes |
|---|---|---|
| Where the panel lives | geometry: own reserved right strip — `padding-right` on the core AppFrame driven by one CSS variable; surface: a plain-DOM dock that re-parents itself into the `[data-shell-overlay]` layer when it commits | The chat column really shrinks; the core "Details" column is never opened by Focus, so the empty core placeholder can not appear; the panel's left-edge grip resizes the strip |
| Resizing / persistence | no public width setter in `ctx.layout` → the dock writes the CSS variable only; state kept in `localStorage` (`dsh-focus.v1`) | Width is clamped 300…520px (the core details contract) with the conversation kept ≥640px; open state, width and the hidden toggle survive restarts |
| Current conversation | `ctx.sessions` → `list.current` + `byId[id].cwd` | Same feed as the sidebar |
| Folder contents | the `remote.fileReferences` namespace (`ctx.remote.fileReferences.list`) | Declared in `inject` like core `ui-reference` does; re-resolved on every refresh with a `waiting` retry phase, because the namespace is a service that can mount after Focus activates. Expanded tree folders list through the same engine (`face.loadPath`) |
| Dotfiles | second query `./.` / `<dir>/.` (fragment starts with `.`) | That mode is fuzzy, so the client keeps only names starting with `.`, merges with the plain listing and dedupes |
| Row cap | patch restates the `file-reference-local` row `config.maxResults: 2000` | Stock cap is 20; a real listing would truncate |

## Why plain JavaScript (no TypeScript, no build step)

The browser half must be a single module-table file exactly like core client
packages (`window.__ModuleLoader__.load({ id, factory })`), hand-written,
served straight from the package. A TypeScript pipeline would insert a compile
step between every edit and the running app — no HMR, no watch loop — and
would fight the harness's own (untyped, evolving) client surface. Plain JS +
JSDoc keeps the edit→restart cycle instant and the code greppable against the
core bundles. The Node half ships a small `.d.ts` for editors.

## Files

- `cordis.patch.yml` — bundle layer: raises the file-reference listing cap and
  inserts the `focus` row.
- `lib/index.js` — Node half (no-op row so the client bundle ships).
- `lib/index.d.ts` — ambient types for the Node half.
- `lib/client.js` — browser half: focus store (phases, dotfiles, retry,
  per-path listing) + plain-DOM dock/rail with the inline tree, the drag
  divider, and the reserved-strip mount. The React `shell.overlay` seat
  renderer is kept only as reference; the DOM panel is the sole renderer.

When DeepSeek Harness ships the native right Sidebar extension seam, the panel
is re-homed onto it.
