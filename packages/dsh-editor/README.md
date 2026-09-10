# dsh-editor (alpha.3)

**Editor** is a **tab type for the pack's right bar** (`dsh-rightbar` — the
right-hand column of the DeepSeek Harness web GUI, beside the **Start** page and
the **Files** tab that `dsh-rightbar-files` provides). It opens **text files
only** (strict UTF-8, binary is refused), edits them with a vendored
**CodeMirror 6**, and saves them back to disk. It is a **sub-plugin**: it holds
no bar code, and its host-side half owns the pack's only HTTP routes. Alpha.

## What alpha.3 does

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
- **Creatable from "+".** The tab strip's add control opens the **Start** page;
  this type contributes a guide entry ("Editor"), so picking it creates an empty
  editor tab whose body is a **workspace file picker** — choosing a file there
  opens it in that same tab (`replaceTab`), not in a second one.
- **Edit**: CodeMirror 6 with line numbers, history/undo, bracket matching,
  autocomplete, find-in-file, and syntax highlighting for js/ts/jsx/tsx, json,
  markdown, python, html, css, yaml. Line-wrapping for prose-ish files. The
  editor always renders on the dark oneDark palette (the Sidebar's panel uses
  the dark design tokens). The engine is **lazy**: the vendored classic bundle is
  fetched once from `/api/dsh-editor/vendor` the first time a file opens.
- **Toolbar**: a find-in-file search input and a **Save** button. Save is enabled
  only when a file is open *and* modified; **Ctrl/Cmd+S** works inside the
  editor. The chip of a dirty tab carries a dot.
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
lib/index.js          Node half: the three /api/dsh-editor routes above
lib/client.js         Browser half: tab type + guide entry, body (CodeMirror or the
                      file picker), title with the dirty dot (module-table bundle)
lib/vendor/cm6.min.js GENERATED - the vendored CodeMirror 6 classic bundle
                      (IIFE on window.DSHEditorCM); commit it, do not edit by hand
vendor/package.json   +  vendor/entry.js  — reproducible CM6 build inputs
```

### Regenerating the vendored CodeMirror bundle

Only needed when the CM6 version set changes (not for plugin code edits):

```powershell
cd packages/dsh-editor/vendor
npm install
npx --yes esbuild entry.js --bundle --minify --format=iife --global-name=DSHEditorCM `
  --target=es2020 --outfile=..\lib\vendor\cm6.min.js
```

`lib/client.js` itself stays hand-written — no build step for normal edits.

## Install / uninstall

Repo `install.bat` / `uninstall.bat` auto-discover this package (it is a
standard `dsh.bundle`); nothing else changes. After a version bump, a plain
`install.bat` re-adds it; the web profile gets it as a live link, so code edits
just need a restart of `npx @deepseek-ai/dsh web` plus a hard refresh.
