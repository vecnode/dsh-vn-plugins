# dsh-focus (alpha)

**Focus** is a DeepSeek Harness Web UI plugin that adds a panel on the right
edge of the window, mirroring the left navigation panel: a full-height column
that collapses into a slim rail with expand/collapse controls. It shows a
`lorem ipsum` placeholder plus the folder the current conversation is working
in — one row per file and folder, folders first, click to open folders —
Claude-Code style, using the native DSH design tokens.

Alpha status: built against the shipped `@deepseek-ai/dsh@0.1.2-rc.1` surface
and promoted to stable only when its owner says so.

> On the rc.1 line the GUI has no third-party right-column seam (the native
> right Sidebar arrives in a later release), so the panel docks over the
> conversation's right edge via the empty core `shell.overlay` seat. If that
> seat cannot be registered for any reason, the plugin mounts a plain-DOM
> panel instead, so it always appears. When DSH ships the right-sidebar
> extension API, only the mounting code changes.

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
- `lib/client.js` — browser half: the panel/rail component + focus store (+
  plain-DOM fallback mount).

## Current content (alpha iteration)

- A right-side panel **visible by default**: title "Focus", `alpha` badge, and
  a collapse control. Collapsing leaves a slim rail (like the left panel's)
  with an expand control and a vertical "Focus" label.
- A `lorem ipsum` placeholder paragraph at the top of the panel.
- A **Conversation folder** section below it once a conversation with a
  working folder is selected (rows, folders first, hidden files via the
  footer toggle). No live file watching, no diff view, no open-in-editor yet.

When DeepSeek Harness ships the native right Sidebar extension seam, the panel
is re-homed onto it.
