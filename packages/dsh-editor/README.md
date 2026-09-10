# dsh-editor (alpha.4)

**Editor** is a **tab type for the pack's right bar** (`dsh-rightbar` — the
right-hand column of the DeepSeek Harness web GUI, beside the **Start** page and
the **Files** tab that `dsh-rightbar-files` provides). It opens **text files
only** (strict UTF-8, binary is refused), edits them with a vendored
**CodeMirror 6**, starts **blank documents** from the tab strip's "+", names and
creates new files through the shared **`dsh-modal`** dialog, and saves them back
to disk. It is a **sub-plugin**: it holds no bar code, and its host-side half
owns the pack's own HTTP routes. Alpha.

## What alpha.4 does

- **Registered into the right bar** through the bar's tab-type registry
  (`ctx.sidebarRightTabs.register`, provided by `dsh-rightbar`): id
  `dsh-editor`, kind `editor`, with the body and the chip title registered in
  the keyed `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title` seats.
  There is no private dock, no header capsule and no window bridge.
- **Text files open editable.** The type declares `dsh-resource://file/**` in
  the `extension` priority band, which outranks every viewer the product ships,
  and vetoes in `canOpen`:
  - files the shipped previews own (`.md`/`.markdown`/`.html`/images/PDF/office/
    archive/media/binary extensions) — those keep their own preview tab;
  - paths outside the session workspace (including the authorizing-less
    `absolute/…` addresses).
  So clicking a `.ts`, `.json`, `.py`, `.txt` … in the Files tree opens it in the
  editor; clicking a `.md` or a `.png` opens the shipped preview as before.
- **"+" → Editor opens a BLANK document.** Picking the guide entry creates an
  editor tab on an empty, unnamed document: nothing is read from disk and the
  tab holds no workspace browser. The file bar reads *Untitled* and **Save** is
  always offered.
- **Saving a blank document names it.** Save (or Ctrl+S) opens the pack's shared
  dialog (`dsh-modal`'s `modals` service) asking for the **file name with its
  extension** — a relative path such as `notes.md` or `src/app.ts`, created in
  **this conversation's workspace folder** (the same place the tab was opened
  from); the folder must already exist. The dialog validates the name (an
  extension is required, dotfiles excepted; no absolute or `..` paths), shows
  the server's answer **inside the dialog** when the name is taken
  (`409 EXISTS`) and keeps what was typed. On success:
  - an ordinary text/code file (`.txt`, `.ts`, `.json`, `.py`, …) becomes its own
    tab (`replaceTab`), so the chip shows the file name and every later save is
    an ordinary in-place save — exactly as if the file had been clicked in the
    Files tree;
  - an extension a shipped preview owns (`.md`, `.html`, an image, a PDF, …)
    **stays in the editor**: the chip takes the file's name through the tab
    title store, and later saves go in place. The tab is deliberately not handed
    to the preview, because the preview cannot edit the file and this tab is the
    only place that can.
  Without `dsh-modal` mounted the dialog falls back to the browser's own prompt.
- **Edit**: CodeMirror 6 with line numbers, history/undo, bracket matching,
  autocomplete, find-in-file, and syntax highlighting for js/ts/jsx/tsx, json,
  markdown, python, html, css, yaml. Line-wrapping for prose-ish files. The
  editor always renders on the dark oneDark palette (the Sidebar's panel uses
  the dark design tokens). The engine is **lazy**: the vendored classic bundle is
  fetched once from `/api/dsh-editor/vendor` the first time a file opens.
- **Toolbar**: a find-in-file search input and a **Save** button. Save is offered
  for an unnamed document at all times and for an open file while it is modified;
  **Ctrl/Cmd+S** works inside the editor. The chip of a tab with unsaved work
  carries a dot.
- **Saving** is optimistic and atomic: the panel PUTs the whole document with the
  mtime/size it opened with; the server re-checks containment and writes a temp
  file renamed over the target. If the file changed on disk meanwhile the panel
  offers **Reload** / **Save anyway** instead of silently clobbering.
- Unsaved edits are NOT persisted across tab closes or app restarts (alpha
  caveat — save before closing a tab).

## How the write path works (no core patches)

The browser cannot write files on this dsh line: `remote.workspaceFiles` reads
files and lists folders but exposes **no mutation operation**. Mirroring the
shipped `dsh-session-log-export` plugin, the Node half registers
**authenticated routes** through the `connection` service:

| Route | What it does |
|---|---|
| `GET /api/dsh-editor/file?session=<id>&path=<rel>` | read one text file (the host resolves the session's workspace root, containment-checks the path against it; strict UTF-8, no NUL; ≤ 2 MiB) |
| `PUT /api/dsh-editor/file` | save one text file `{session, path, text, expected?: {mtimeMs, size}}` (atomic temp+rename; 409 when the file moved on disk) |
| `PUT /api/dsh-editor/file` with `{create: true}` | **create** a new file at `path` (the PARENT folder must exist inside the workspace and is realpath-checked; the target must not exist — `409 EXISTS`; published create-exclusive, so a create never overwrites a file the user did not open) |
| `GET /api/dsh-editor/vendor` | serve the vendored CodeMirror 6 classic bundle (lazy, cached) |

The session id is what the tab's address already carries
(`dsh-resource://file/session/<sessionId>/<path>`); the workspace root is
resolved **host-side** — live session header first, session persistence second,
exactly like `@deepseek-ai/dsh-api-workspace-files` resolves its own reads. The
client never names a root, and a session whose root cannot be resolved gets a
typed `NO_WORKSPACE` failure instead of a guess.

The web profile exposes the same `connection` surface the route registration
uses on every boot.

## Layout

```
cordis.patch.yml      bundle layer: inserts the 'editor' row (nothing else patched)
lib/index.js          Node half: the /api/dsh-editor routes above (read, save, create, vendor)
lib/client.js         Browser half: tab type + guide entry, body (blank document or an
                      open file), the save-as dialog over the `modals` service, and
                      the title with the dirty dot (module-table bundle)
lib/vendor/cm6.min.js GENERATED - the vendored CodeMirror 6 classic bundle
                      (IIFE on window.DSHEditorCM); commit it, do not edit by hand
vendor/package.json   +  vendor/entry.js  — reproducible CM6 build inputs
```

The save-as dialog lives in [`packages/dsh-modal`](../dsh-modal): the editor
resolves the `modals` service **lazily** (`ctx.get('modals')` at save time) and
falls back to `window.prompt` when it is absent, so the editor never depends on
that package being installed. `dsh-modal` is not listed in this package's
`dsh.client.inject` on purpose — the dependency is a service lookup, not a module
load order.

### Regenerating the vendored CodeMirror bundle

Only needed when the CM6 version set changes (not for plugin code edits). The
build runs anywhere Node does; only the last line's output path differs per OS:

```sh
cd packages/dsh-editor/vendor
npm install
npx --yes esbuild entry.js --bundle --minify --format=iife --global-name=DSHEditorCM \
  --target=es2020 --outfile=../lib/vendor/cm6.min.js
```

(On Windows use `..\lib\vendor\cm6.min.js` in the last argument.)

`lib/client.js` itself stays hand-written — no build step for normal edits.

## Install / uninstall

The repo launcher (`install.bat` on Windows, `./install.sh` on macOS/Linux)
auto-discovers this package — it is a standard `dsh.bundle` — and so does the
uninstaller; nothing else changes. After a version bump, a plain launcher run
re-adds it; the web profile gets it as a live link, so code edits just need a
restart of `npx @deepseek-ai/dsh web` plus a hard refresh.
