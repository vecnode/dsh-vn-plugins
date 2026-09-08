# dsh-focus (alpha)

**Focus** is a DeepSeek Harness Web UI plugin that docks a small panel on the
right edge of the window and shows the folder the current conversation is
working in — one row per file and folder, folders first, click to open
folders — Claude-Code style, using the native DSH design tokens.

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

## How it works (no custom host APIs)

| Need | Uses | Notes |
|---|---|---|
| Where the panel lives | core `shell.overlay` seat declared by `ui-layout` (empty in the shipped web app) | No core slot takeover, no DOM surgery |
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
- `lib/client.js` — browser half: the dock component + focus store.

## v1 scope (per owner)

Only one function: **show the folder contents of the current conversation**.
No live file watching, no diff view, no open-in-editor yet. Hidden dotfiles are
hidden by default (toggle in the footer). When DeepSeek Harness ships the
native right Sidebar extension seam, the dock is re-homed onto it.
