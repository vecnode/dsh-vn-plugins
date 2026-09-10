# dsh-vn-plugins

Personal plugin pack for **DeepSeek Harness** (Windows), installed into the
**web profile** only — the raw install you run with
`npx @deepseek-ai/dsh web` (profile `web` under `$DSH_HOME`, default
`%USERPROFILE%\.dsh`). **DSH Desktop is not supported** by this pack.

Everything ships as standard **dsh bundles** (npm packages with
`dsh.bundle`/`dsh.client` + a `cordis.patch.yml` layer), so install and
uninstall are clean and nothing patches core Harness files.

## Plugins (all **alpha** until the owner promotes them)

| Package | What it does | Status |
|---|---|---|
| [`packages/dsh-editor`](packages/dsh-editor) | **Editor** — a **tab type for the GUI's own right Sidebar** (the column the header's expand button opens, next to the shipped **Start** and **Files** tabs). It claims `dsh-resource://file/**` in the `extension` band, so opening a **text/code file** in the Sidebar (a click in the Files tree, a file link in the conversation) opens it **editable** there instead of in the read-only preview — Markdown/HTML/images/PDF keep their own previews. It also contributes a guide entry, so the tab strip's **"+"** control offers **Editor**: picking it creates an editor tab with a workspace file picker. Edits are saved to disk over an authenticated plugin route (find-in-file toolbar + **Save**). | alpha `0.1.0-alpha.2` |

> The pack used to ship its own **Files** panel (`dsh-files`, earlier
> `dsh-focus`) with a private dock and header capsules. The harness now ships
> that panel natively — the right Sidebar has a Files tab of its own — so the
> plugin was **retired** and the installer prunes both old names from every
> profile it touches.

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
  `.dsh-version.json` (`0.1.5-rc.1`). That line is what the right Sidebar's
  tab-type registry exists on; when DSH evolves, bump the pin and adapt the
  plugins (see `docs/COMPATIBILITY.md`).
- **Language**: the UI halves are intentionally **plain JavaScript**, no build
  step — core client packages ship hand-written module-table bundles and the
  edit→restart loop stays instant. The one exception is `dsh-editor`'s
  **vendored CodeMirror 6** artifact (`lib/vendor/cm6.min.js`), a generated
  classic bundle rebuilt only when the CM6 version set changes (see
  `packages/dsh-editor/README.md`); the plugin's own client code stays
  hand-written.
- **Iterating on a change**: double-clicking `install.bat` **re-syncs every
  bundle whose version in this repo changed** — bump `package.json` +
  `.dsh-version.json`, then a plain double-click re-adds it;
  `install.bat -Force` re-adds regardless. One extra rule for the loop to
  *look* applied: the web profile installs `dsh-editor` as a **live link** into
  this repo, so code edits are already "installed" there — you only need to
  **restart** `npx @deepseek-ai/dsh web` and **hard-refresh** the browser
  (Ctrl+F5). The client bundle is read once at app boot.
- See [`docs/INSTALL.md`](docs/INSTALL.md) for the manual path and
  troubleshooting.

## Security & license

- MIT — see [LICENSE](LICENSE). Plugins are authored by **vecnode**.
- Security policy (supported line, private reporting, hardening expectations):
  [SECURITY.md](SECURITY.md). This pack never touches API keys, never patches
  DeepSeek core packages, and installs only the pinned harness line.

## Repository layout

```
AGENTS.md              quick-start brief for coding agents working in this repo
ARCHITECTURE.md        deep dive: plugin model, the right-Sidebar editor tab, installer
LICENSE                MIT license (vecnode)
SECURITY.md            security policy: supported line, private reporting, hardening
packages/<bundle>/     one standalone dsh bundle (package.json + cordis.patch.yml + lib/)
  lib/index.js         Node half (may be a no-op row so the client bundle ships)
  lib/client.js        Browser half (module-table bundle; no build step)
scripts/               install-all.ps1/.bat, uninstall-all.ps1/.bat
.dsh-version.json      the pinned harness line + per-package versions
install.bat            double-click installer  |  uninstall.bat  double-click remover
```
