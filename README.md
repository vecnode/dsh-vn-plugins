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
| [`packages/dsh-editor`](packages/dsh-editor) | **Editor tab** — a tab type registering into the bar above. Claims `dsh-resource://file/**` in the `extension` band, so opening a **text/code file** (a click in the Files tree, a file link in the conversation) opens it **editable** instead of in the read-only preview — Markdown/HTML/images/PDF keep their own previews. Contributes a guide entry, so **"+"** offers **Editor**: picking it creates an editor tab with a workspace file picker. Host-side code saves edits to disk over an authenticated route (find-in-file toolbar + **Save**). | alpha `0.1.0-alpha.3` |

> The pack used to ship its own Files panel (`dsh-files`, earlier `dsh-focus`)
> with a private dock and header capsules; that was retired when the harness
> grew a real right Sidebar. Now the pack goes one step further and **owns the
> bar itself** by forking it — see `packages/dsh-rightbar/README.md` and the
> `scripts/sync-vendored.ps1` re-sync path.

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
  `.dsh-version.json` (`0.1.5-rc.1`). `dsh-rightbar` / `dsh-rightbar-files` are
  **forks** of that line's client bundles; after a pin bump run
  `scripts\sync-vendored.ps1` to move the fork forward (see
  `packages/dsh-rightbar/README.md`).
- **Language**: the UI halves are intentionally **plain JavaScript**, no build
  step — core client packages ship hand-written module-table bundles and the
  edit→restart loop stays instant. Two files are **generated, never hand-edited**:
  `dsh-editor`'s vendored **CodeMirror 6** artifact (`lib/vendor/cm6.min.js`)
  and the two forked bar bundles (`dsh-rightbar/lib/client.js`,
  `dsh-rightbar-files/lib/client.js`).
- **Iterating on a change**: double-clicking `install.bat` **re-syncs every
  bundle whose version in this repo changed** — bump `package.json` +
  `.dsh-version.json`, then a plain double-click re-adds it;
  `install.bat -Force` re-adds regardless. One extra rule for the loop to
  *look* applied: the web profile installs all three bundles as **live links**
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
.dsh-version.json      the pinned harness line + per-package versions
install.bat            double-click installer  |  uninstall.bat  double-click remover
```
