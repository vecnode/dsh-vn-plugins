# dsh-focus (alpha)

**Focus** is a DeepSeek Harness Web UI plugin that adds a real right-hand
column **after** the chat column (never on top of it), mirroring the left
navigation panel: collapsing Focus hands the space back to the chat, and an
expand control on the right edge reopens it. It shows a `lorem ipsum`
placeholder plus the folder the current conversation is working in — one row
per file and folder, folders first, click to open folders — Claude-Code style,
using the native DSH design tokens.

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

> How the space is reserved: rc.1's layout grid already owns a right
> "details" track (opened/closed through the cross-plugin `ctx.layout`
> service and resizable by its own drag handle). Focus opens that track and
> renders inside it (via the empty core `shell.overlay` seat), tracking the
> live grid width, so the chat genuinely shrinks instead of being covered.
> The core `details` seat itself stays untouched (single-occupant, owned by
> chat); Focus only rides the geometry. If the seat cannot be registered for
> any reason, a plain-DOM fallback reserves the same track. When DSH ships
> the native right-sidebar extension API, only the mounting code changes.

## How it works (no custom host APIs)

| Need | Uses | Notes |
|---|---|---|
| Where the panel lives | geometry: core right "details" grid track via `ctx.layout.openDetails()/closeDetails()`; surface: `shell.overlay` seat declared by `ui-layout` | The chat column really shrinks; the panel never covers it; follows the user's drag handle |
| Current conversation | `ctx.sessions` → `list.current` + `byId[id].cwd` | Same feed as the sidebar |
| Folder contents | `ctx.remote.fileReferences.list(sessionId, query)` | Kind-aware (`file`/`directory`), workspace-cwd-scoped, directory-scoped queries list live state — the same remote the `@` file menu uses |
| Row cap | patch restates the `file-reference-local` row `config.maxResults: 2000` | Stock cap is 20; a real listing would truncate |

The bundle is a single hand-written file in the exact module-table format core
packages ship (`window.__ModuleLoader__.load({ id, factory })`) — no build step,
no dependency on unpublished tooling, easy to keep working as DSH evolves.

## Files

- `cordis.patch.yml` — bundle layer: raises the file-reference listing cap and
  inserts the `focus` row.
- `lib/index.js` — Node half (no-op row so the client bundle ships).
- `lib/client.js` — browser half: the panel/rail component + focus store (+
  plain-DOM fallback mount).

## Current content (alpha iteration)

- A right-hand column **visible by default**, next to (after) the chat —
  never overlapping it. Header shows the title "Focus" and the `alpha` badge
  with a single-chevron collapse control; collapsing closes the column (the
  chat regains the full width) and leaves the same chevron floating on the
  right edge to expand again.
- The panel body is the **Conversation folder**: the folder path on top, then
  a full-width row-per-file list of its files/folders (folders first, click
  to open; hidden files via the footer toggle). The list always follows the
  currently selected conversation. No live file watching, no diff view, no
  open-in-editor yet.

When DeepSeek Harness ships the native right Sidebar extension seam, the panel
is re-homed onto it.
