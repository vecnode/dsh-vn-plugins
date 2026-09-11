# dsh-vn-plugins

![Language: JavaScript](https://img.shields.io/badge/language-JavaScript-f7df1e?logo=javascript&logoColor=black)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![DeepSeek Harness 0.1.5-rc.1](https://img.shields.io/badge/dsh-0.1.5--rc.1-4f8cff)

Personal plugin pack for **DeepSeek Harness**.

Everything ships as standard **dsh bundles**. The plugins are
plain JavaScript, and the launchers run on **Windows, macOS and Linux** — the
Windows half is PowerShell, the macOS/Linux half is plain POSIX shell.

## Plugins (all **alpha**)

Each package's own README is the reference for what it does, why it is built that
way and what it touches; the table below is the map.

| Package | What it does | Status |
|---|---|---|
| [`dsh-vn-master`](packages/dsh-vn-master/README.md) | **Master (blank)** — the pack's base **bundle layer**: one no-op `master` row, installed last so it is the final word on any row. No browser half, no service, no inject edge, so the right bar's tab-type chain is untouched. | alpha `0.1.0-alpha.1` |
| [`dsh-rightbar`](packages/dsh-rightbar/README.md) | **The right bar** — the pack's own fork of the harness right-hand column (tab strip, "+", docking, expand button, Start page) and the tab-type registry every other tab registers into. | alpha `0.1.0-alpha.1` |
| [`dsh-rightbar-files`](packages/dsh-rightbar-files/README.md) | **Files tab** — the session workspace tree as a tab type of that bar. | alpha `0.1.0-alpha.1` |
| [`dsh-editor`](packages/dsh-editor/README.md) | **Editor tab** — text/code files open **editable** (Markdown included, with a **Preview ⇄ Edit** toggle to the rendered page), blank documents are created and named from the "+" guide, and the CodeMirror palette follows the app's light/dark theme. | alpha `0.1.0-alpha.7` |
| [`dsh-themes`](packages/dsh-themes/README.md) | **Themes** — the header's Light / Dark / System button (the same switch as Settings → Appearance) plus the pack's appearance overrides, starting with the always-light **Markdown paper** the rendered view is drawn on. | alpha `0.1.0-alpha.2` |
| [`dsh-modal`](packages/dsh-modal/README.md) | **Shared dialogs** — the `modals` client service (`open` / `alert` / `confirm` / `prompt`) the editor's save-as dialog and any other plugin reach for. | alpha `0.1.0-alpha.1` |
| [`dsh-open-in-app`](packages/dsh-open-in-app/README.md) | **Open In: file managers** — opens the OS file browser directly (Explorer / Finder / Files) instead of the shipped shell-open verb, so the header's file-manager entries actually work. | alpha `0.1.0-alpha.1` |

> The pack used to ship its own Files panel (`dsh-files`, earlier `dsh-focus`)
> with a private dock and header capsules; that was retired when the harness
> grew a real right Sidebar. Now the pack goes one step further and **owns the
> bar itself** by forking it — see `packages/dsh-rightbar/README.md` and the
> `scripts/sync-vendored.ps1` re-sync path. The same fork-and-disable scheme
> owns the **file-manager half of Open In…** (`dsh-open-in-app`).
>
> The pack's **master** is a bundle of its own, `dsh-vn-master`, and it is
> deliberately blank: the bundle layer plus one no-op row, with no browser half,
> no service and no inject edge. So the right bar keeps only bar
> responsibilities, and the master — installed last — is where pack-wide patches
> go.

## Install (Windows, macOS, Linux)

Two launchers, one behaviour. **Windows** runs the PowerShell installer
(`install.bat` → `scripts/install-all.ps1`; Windows PowerShell 5.1 or 7).
**macOS and Linux** run the POSIX shell installer (`install.sh` →
`scripts/install-all.sh`) and need **Node.js with npm/npx only — no PowerShell**.

```bat
:: Windows - double-click install.bat, or:
install.bat                  :: the web profile (the only target)
install.bat -Force           :: re-add bundles even when versions match
```

```sh
# macOS / Linux
./install.sh                 # the web profile (the only target)
./install.sh -Force          # explicit; this launcher forces a re-add anyway
```

Or drive the platform script directly:

```powershell
:: Windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-all.ps1 -Force
```

```sh
# macOS / Linux
sh scripts/install-all.sh -Force
```

Both halves do the same work (idempotent — safe to re-run):

1. pin the dsh version from `.dsh-version.json` and run everything through
   `npx @deepseek-ai/dsh@<pinned>`,
2. reuse a system pnpm when it is new enough for the profile, else bootstrap a
   private copy under `./tools` (no admin rights, nothing global),
3. resolve the web profile (`$DSH_HOME/profiles/web`, `$DSH_HOME` = env var or
   `~/.dsh`),
4. **prune retired bundle names** (`dsh-focus`, `dsh-files` — the pack's own
   Files panel, now shipped by the harness itself) so an upgrade cannot
   double-mount,
5. run `dsh plugin --profile web add <bundle>` for every package under
   `packages/` (skips bundles already at the repo version unless `-Force`),
6. print next steps. Neither half touches API keys — add yours in
   **Settings → Models**.

Remove with **`uninstall.bat`** (Windows) or **`./uninstall.sh`** (macOS/Linux);
each has the same `-Plugin` / `-DshHome` / `-ProfileName` switches. Removing a
bundle also removes its patch layer.

## Notes

- Plugins are **alpha** and are built against the harness line pinned in
  `.dsh-version.json` (`0.1.5-rc.1`). `dsh-rightbar` / `dsh-rightbar-files` /
  `dsh-open-in-app` are **forks** of that line's client bundles; after a pin bump
  run `scripts/sync-vendored.ps1` to move the forks forward (see
  `packages/dsh-rightbar/README.md`). `dsh-open-in-app` is the one fork that is
  not byte-for-byte: its documented patches live in `sync-vendored.ps1`.
  `sync-vendored.ps1` is **maintainer tooling** and is the one script in this
  repo that wants PowerShell 7 (`pwsh`) on macOS/Linux — the installers never do.
- **Language**: the UI halves are intentionally **plain JavaScript**, no build
  step — core client packages ship hand-written module-table bundles and the
  edit→restart loop stays instant. Three files are **generated, never
  hand-edited**: `dsh-editor`'s vendored **CodeMirror 6** artifact
  (`lib/vendor/cm6.min.js`) and the three forked bundles
  (`dsh-rightbar/lib/client.js`, `dsh-rightbar-files/lib/client.js`,
  `dsh-open-in-app/lib/client.js`).
- **Iterating on a change**: a plain `install.bat` / `./install.sh` **re-syncs
  every bundle whose version in this repo changed** — bump `package.json` +
  `.dsh-version.json`, then run the launcher again; `-Force` re-adds regardless
  (needed once when the package SET changes, e.g. a new bundle). One extra rule
  for the loop to
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
.gitattributes         keeps the .sh launchers LF (a CRLF shebang breaks them)
packages/dsh-vn-master/  the one bundle with NO client half - the blank master layer
packages/<bundle>/     one standalone dsh bundle (package.json + cordis.patch.yml + lib/)
  lib/index.js         Node half (may be a no-op row so the client bundle ships)
  lib/client.js        Browser half (module-table bundle; hand-written or GENERATED fork)
scripts/               install-all.ps1 / uninstall-all.ps1 (Windows PowerShell) and
                       install-all.sh / uninstall-all.sh (POSIX sh for macOS/Linux),
                       plus sync-vendored.ps1 (maintainer fork re-sync) and the
                       .bat / .sh console twins
  checks/              standalone verification for the JS halves (see its README)
.dsh-version.json      the pinned harness line + per-package versions
install.bat / .sh      double-click installer  |  uninstall.bat / .sh  remover
```
