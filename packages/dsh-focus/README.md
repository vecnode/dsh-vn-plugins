# dsh-focus (alpha)

**Focus** is a DeepSeek Harness Web UI plugin that adds a real right-hand
column **after** the chat column (never on top of it), mirroring the left
navigation panel. The panel shows the folder the current conversation works in
— one row per file and folder, folders first, click to open — Claude-Code
style, using the native DSH design tokens.

Collapsing Focus hands the space back to the chat and Focus stays visible as a
slim **edge rail** on the right (like the collapsed left sidebar) with an
expand control — it is never closed away and there is no close (x) button.

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

> How the space is reserved: rc.1's layout grid already owns a right
> "details" track (opened/closed through the cross-plugin `ctx.layout`
> service and resizable by its own drag handle). Focus opens that track and
> renders inside it (via the empty core `shell.overlay` seat), tracking the
> live grid width, so the chat genuinely shrinks instead of being covered.
> The core `details` seat itself stays untouched (single-occupant, owned by
> chat); Focus only rides the geometry. If the seat cannot be registered for
> any reason, a plain-DOM fallback reserves the same track and shows the same
> rows. When DSH ships the native right-sidebar extension API, only the
> mounting code changes.

## What the panel shows

- Header: title **Focus**, the `alpha` badge, and a panel-outline control
  that **collapses** the column to the edge rail (expand control on the rail
  reopens it). Both controls carry `aria-expanded`.
- Body: the folder path on top, then **every entry of the folder as a row**
  (folders first, folders open on click, `..` goes up, breadcrumbs appear
  once you drill in). **Dotfiles are shown by default** — `.gitignore`,
  `.dsh-version.json`, hidden folders — dimmed, with a footer
  **"Hidden files"** toggle to turn them off.
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
| Where the panel lives | geometry: core right "details" grid track via `ctx.layout.openDetails()/closeDetails()`; surface: `shell.overlay` seat declared by `ui-layout` | The chat column really shrinks; the panel never covers it; follows the user's drag handle |
| Current conversation | `ctx.sessions` → `list.current` + `byId[id].cwd` | Same feed as the sidebar |
| Folder contents | the `remote.fileReferences` namespace (`ctx.remote.fileReferences.list`) | Declared in `inject` like core `ui-reference` does; re-resolved on every refresh with a `waiting` retry phase, because the namespace is a service that can mount after Focus activates |
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
- `lib/client.js` — browser half: focus store (phases, dotfiles, retry) +
  panel/rail component (+ plain-DOM fallback mount).

When DeepSeek Harness ships the native right Sidebar extension seam, the panel
is re-homed onto it.
