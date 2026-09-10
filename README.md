# dsh-vn-plugins

Personal plugin pack for **DeepSeek Harness** (Windows), installed into the
**web profile** only — the raw install you run with
`npx @deepseek-ai/dsh web` (profile `web` under `$DSH_HOME`, default
`%USERPROFILE%\.dsh`). **DSH Desktop is not supported** by this pack.

Everything ships as standard **dsh bundles** (npm packages with
`dsh.bundle`/`dsh.client` + a `cordis.patch.yml` layer), so install and
uninstall are clean and nothing patches core Harness files.

## Plugins (all **alpha** until the owner promotes them)

`dsh-rightbar` is the **master**: it owns the right bar the other two live in.

| Package | What it does | Status |
|---|---|---|
| [`packages/dsh-rightbar`](packages/dsh-rightbar) | **The right bar** — the pack's own fork of the harness right-hand column: tab strip with the **"+"** add control, docking panel (split / float / fullscreen), header expand button, the **Start** (guide) page, the tab-type registry (`sidebarRightTabs`) and controller (`sidebarRight`) other plugins register into, and the keyed tab body/title seats. Its bundle layer **hard-disables the shipped `ui-sidebar-right` / `ui-sidebar-files` rows**, so this copy is the one that runs. | alpha `0.1.0-alpha.1` |
| [`packages/dsh-rightbar-files`](packages/dsh-rightbar-files) | **Files tab** — the session workspace tree as a tab type of the pack's bar (forked from the shipped `@deepseek-ai/dsh-client-ui-sidebar-files`, same disable-and-replace scheme). A file row opens its `dsh-resource://file/...` address, which the registry routes to whoever claims it. | alpha `0.1.0-alpha.1` |
| [`packages/dsh-editor`](packages/dsh-editor) | **Editor tab** — a tab type registering into the bar above. Claims `dsh-resource://file/**` in the `extension` band, so opening a **text/code file** (a click in the Files tree, a file link in the conversation) opens it **editable** instead of in the read-only preview — Markdown/HTML/images/PDF keep their own previews. Contributes a guide entry, so **"+"** offers **Editor**: picking it opens a **blank** document — nothing is read from disk and there is no browser inside the tab. **Save** (or Ctrl+S) asks for a file name **with its extension** in the shared dialog, creates the file where the tab was opened (this conversation's workspace folder) and turns the tab into that file's tab. Saving an already-open file is unchanged (find-in-file toolbar + atomic authenticated save). | alpha `0.1.0-alpha.4` |
| [`packages/dsh-modal`](packages/dsh-modal) | **Shared dialogs** — the pack's modal surface, provided as the client service **`modals`** (`ctx.get('modals')`: `open` / `alert` / `confirm` / `prompt`). One body-level overlay for the whole app, one dialog at a time, Escape/mask cancel, and `submit` work that runs **while the dialog stays open** so a failure is reported inline instead of losing what was typed. | alpha `0.1.0-alpha.1` |
| [`packages/dsh-open-in-app`](packages/dsh-open-in-app) | **Open In: file managers** — fixes the Session header's **Open In…** file-browser entries. Fork of the shipped `@deepseek-ai/dsh-client-ui-open-in-app` browser bundle (same UI, one patched launch path) plus a Node half that opens the OS file browser **directly**: `explorer.exe` on Windows, `open` on macOS, `xdg-open` on Linux, WSL-aware — instead of the shipped shell-open verb, which reports success without opening anything on some hosts. Editors, Git GUIs and terminals keep using the shipped routes. | alpha `0.1.0-alpha.1` |

> The pack used to ship its own Files panel (`dsh-files`, earlier `dsh-focus`)
> with a private dock and header capsules; that was retired when the harness
> grew a real right Sidebar. Now the pack goes one step further and **owns the
> bar itself** by forking it — see `packages/dsh-rightbar/README.md` and the
> `scripts/sync-vendored.ps1` re-sync path. The same fork-and-disable scheme
> owns the **file-manager half of Open In…** (`dsh-open-in-app`).

## Install (Windows)

Double-click **`install.bat`**, or run from a terminal:

```bat
install.bat                  :: the web profile (the only target)
install.bat -Target cli      :: same thing; "cli" is kept as an alias
```

What it does (idempotent — safe to re-run):

1. pins the dsh version from `.dsh-version.json` and runs everything through
   `npx @deepseek-ai/dsh@<pinned>`,
2. bootstraps a private copy of pnpm under `.\tools` when pnpm is missing
   (no admin rights, nothing global),
3. resolves the web profile (`$DSH_HOME\profiles\web`, `$DSH_HOME` = env var or
   `%USERPROFILE%\.dsh`),
4. **prunes retired bundle names** (`dsh-focus`, `dsh-files` — the pack's own
   Files panel, now shipped by the harness itself) so an upgrade cannot
   double-mount,
5. runs `dsh plugin --profile web add <bundle>` for every package under
   `packages/` (skips already-installed bundles unless `-Force`),
6. prints next steps. It never touches API keys — add yours in
   **Settings → Models**.

Remove with **`uninstall.bat`**. Removing a bundle also removes its patch layer.

## Notes

- Plugins are **alpha** and are built against the harness line pinned in
  `.dsh-version.json` (`0.1.5-rc.1`). `dsh-rightbar` / `dsh-rightbar-files` /
  `dsh-open-in-app` are **forks** of that line's client bundles; after a pin bump
  run `scripts\sync-vendored.ps1` to move the forks forward (see
  `packages/dsh-rightbar/README.md`). `dsh-open-in-app` is the one fork that is
  not byte-for-byte: its documented patches live in `sync-vendored.ps1`.
- **Language**: the UI halves are intentionally **plain JavaScript**, no build
  step — core client packages ship hand-written module-table bundles and the
  edit→restart loop stays instant. Three files are **generated, never
  hand-edited**: `dsh-editor`'s vendored **CodeMirror 6** artifact
  (`lib/vendor/cm6.min.js`) and the three forked bundles
  (`dsh-rightbar/lib/client.js`, `dsh-rightbar-files/lib/client.js`,
  `dsh-open-in-app/lib/client.js`).
- **Iterating on a change**: double-clicking `install.bat` **re-syncs every
  bundle whose version in this repo changed** — bump `package.json` +
  `.dsh-version.json`, then a plain double-click re-adds it;
  `install.bat -Force` re-adds regardless (needed once when the package SET
  changes, e.g. a new bundle). One extra rule for the loop to
  *look* applied: the web profile installs every bundle as a **live link**
  into this repo, so code edits are already "installed" there — you only need to
  **restart** `npx @deepseek-ai/dsh web` and **hard-refresh** the browser
  (Ctrl+F5). The client bundle is read once at app boot.
- See [`docs/INSTALL.md`](docs/INSTALL.md) for the manual path and
  troubleshooting.

## Security & license

- MIT — see [LICENSE](LICENSE). Plugins are authored by **vecnode**.
- Security policy (supported line, private reporting, hardening expectations):
  [SECURITY.md](SECURITY.md). This pack never touches API keys and never patches
  DeepSeek core files: it adds its own rows and (for the right bar) disables the
  shipped rows, then supplies its own copied bundles.

## Repository layout

```
AGENTS.md              quick-start brief for coding agents working in this repo
ARCHITECTURE.md        deep dive: plugin model, the right bar fork, the editor tab, installer
LICENSE                MIT license (vecnode)
SECURITY.md            security policy: supported line, private reporting, hardening
packages/<bundle>/     one standalone dsh bundle (package.json + cordis.patch.yml + lib/)
  lib/index.js         Node half (may be a no-op row so the client bundle ships)
  lib/client.js        Browser half (module-table bundle; hand-written or GENERATED fork)
scripts/               install-all.ps1/.bat, uninstall-all.ps1/.bat, sync-vendored.ps1
  checks/              standalone verification for the JS halves (see its README)
.dsh-version.json      the pinned harness line + per-package versions
install.bat            double-click installer  |  uninstall.bat  double-click remover
```
