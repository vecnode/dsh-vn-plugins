# dsh-editor (alpha)

**Editor** is the second tab of the Files right dock: a text/code editor for
the DeepSeek Harness Web UI. It opens **text files only** (strict UTF-8,
binary is refused), edits them with a vendored **CodeMirror 6**, and saves them
back to disk. Alpha.

![Triggers: the "Editor" capsule sits to the right of "Files" in the session
header; double-clicking a text file in the Files tree opens it here.]

## What alpha.1 does

- An **"Editor" header capsule** right of the "Files" capsule (same core
  `conversation.session.header.utilities` seat, `order: 200`) opens/closes the
  Editor tab in the Files dock — the dock itself, its tab strip and resize grip
  belong to `dsh-files`; this plugin only *registers into* them through the
  window host API dsh-files publishes (`window.__dshFilesHost`, event
  `dsh-files:host-ready`).
- **Open**: double-click a file row in the Files tree (only files; folders
  still expand on click). The panel GETs the file over the plugin's own
  authenticated route and enforces *text only*: non-UTF-8 / binary files show
  "Not a text file" instead of opening. Files up to 2 MiB.
- **Edit**: CodeMirror 6 with line numbers, history/undo, bracket matching,
  autocomplete, find-in-file, and syntax highlighting for js/ts/jsx/tsx, json,
  markdown, python, html, css, yaml. Line-wrapping for prose-ish files. Light
  and dark theme follow the OS preference. The engine is **lazy**: the vendored
  classic bundle is fetched once from `/api/dsh-editor/vendor` the first time a
  file opens.
- **Toolbar**: a **find-in-file search input** (no refresh button — refreshing
  would throw your edits away) and a **Save** button. Save is enabled only when
  a file is open *and* modified; **Ctrl/Cmd+S** works inside the editor.
- **Saving** is optimistic and atomic: the panel PUTs the whole document with
  the mtime/size it opened with; the server re-checks containment and writes a
  temp file renamed over the target. If the file changed on disk meanwhile the
  panel offers **Reload** / **Save anyway** instead of silently clobbering.
- **Dirty state**: a "Modified" dot on the file bar; opening another file while
  dirty asks first. Unsaved edits are NOT persisted across tab closes or app
  restarts (alpha caveat — close a tab after saving).

## How the write path works (no core patches)

The browser cannot write files on this dsh line (the served remotes only
`list` file references). Mirroring the shipped `dsh-session-log-export` plugin,
the Node half registers **authenticated routes** through the `connection`
service:

| Route | What it does |
|---|---|
| `GET /api/dsh-editor/file?cwd=<dir>&path=<rel>` | read one text file (containment-checked against the conversation cwd; strict UTF-8, no NUL; ≤ 2 MiB) |
| `PUT /api/dsh-editor/file` | save one text file `{cwd, path, text, expected?: {mtimeMs, size}}` (atomic temp+rename; 409 when the file moved on disk) |
| `GET /api/dsh-editor/vendor` | serve the vendored CodeMirror 6 classic bundle (lazy, cached) |

Both targets (raw CLI web + dsh-desktop) expose the same `connection` surface.

## Layout

```
cordis.patch.yml      bundle layer: inserts the 'editor' row (nothing else patched)
lib/index.js          Node half: the three /api/dsh-editor routes above
lib/client.js         Browser half: header capsule, panel registration, CodeMirror
                      editor, open/save/dirty logic (module-table bundle)
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
`install.bat` re-adds it; the raw CLI profile gets it as a live link, so code
edits just need a restart of `npx @deepseek-ai/dsh web` plus a hard refresh —
dsh-desktop needs a relaunch to refresh its generation snapshot.
