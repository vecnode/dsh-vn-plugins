# dsh-vn-plugins

Personal plugin pack for **DeepSeek Harness** (Windows), installable into both
places you run the harness:

- the **raw CLI install** — `npx @deepseek-ai/dsh web` (profile `web` under `$DSH_HOME`, default `%USERPROFILE%\.dsh`)
- **dsh-desktop** — its own harness home under the Electron user data folder

Everything ships as standard **dsh bundles** (npm packages with
`dsh.bundle`/`dsh.client` + a `cordis.patch.yml` layer), so install and
uninstall are clean on both targets and nothing patches core Harness files.

## Plugins (all **alpha** until the owner promotes them)

| Package | What it does | Status |
|---|---|---|
| [`packages/dsh-files`](packages/dsh-files) | **Files** — a right-hand panel dock next to the chat (never overlapping it), opened with a **"Files" trigger** in the session header beside the "Session log" capsule. Claude-style tab strip with a close-x per panel, Claude-Code-style search + refresh toolbar, and the current conversation's folder as an inline tree (dotfiles on by default with a footer toggle). No collapsed rail: the panel is expanded or gone. | alpha `0.1.0-alpha.11` |

## Install (Windows)

Double-click **`install.bat`**, or run from a terminal:

```bat
install.bat                  :: both targets
install.bat -Target cli      :: only the raw CLI profile
install.bat -Target desktop  :: only dsh-desktop (close the app first)
```

> With the default `-Target all`, a machine that has **no dsh-desktop** is not
> an error: the desktop target is skipped with a warning and the run succeeds.
> Use `-Target desktop` (which fails loudly when no desktop profile is found)
> after installing/running dsh-desktop.

What it does (idempotent — safe to re-run):

1. pins the dsh version from `.dsh-version.json` and runs everything through
   `npx @deepseek-ai/dsh@<pinned>`,
2. bootstraps a private copy of pnpm under `.\tools` when pnpm is missing
   (no admin rights, nothing global),
3. detects the CLI profile (`$DSH_HOME\profiles\web`) and the dsh-desktop
   harness profile(s) under `%APPDATA%`,
4. **prunes legacy bundle names** (`dsh-focus`, the alpha.9 name of the Files
   plugin) from each profile so an upgrade cannot double-mount,
5. runs `dsh plugin --profile <profile> add <bundle>` for every package under
   `packages/` (skips already-installed bundles unless `-Force`),
6. prints next steps. It never touches API keys — add yours in
   **Settings → Models**.

Remove with **`uninstall.bat`** (same target detection). Removing the bundle
also removes its patch layer, so the `file-reference-local` row override that
dsh-files ships is reverted automatically.

## Notes

- Plugins are **alpha** and are built against the harness line pinned in
  `.dsh-version.json` (`0.1.2-rc.1` — the current `latest`/`next` on npm and
  the line dsh-desktop stable is built on). When DSH evolves, bump the pin and
  adapt the plugins (see `docs/COMPATIBILITY.md`).
- **Language**: the UI halves are intentionally **plain JavaScript**, no build
  step — core client packages ship hand-written module-table bundles and the
  edit→restart loop stays instant. See `packages/dsh-files/README.md`.
- **Iterating on a change**: double-clicking `install.bat` (or `install.bat
  -Target cli|desktop`) now **re-syncs every bundle whose version in this repo
  changed** — bump `package.json` + `.dsh-version.json`, then a plain
  double-click re-adds it; `install.bat -Force` re-adds regardless. Two extra
  rules for the loop to *look* applied:
  - the raw-CLI profile installs `dsh-files` as a **live link** into this repo,
    so code edits are already "installed" there — you only need to **restart**
    `npx @deepseek-ai/dsh web` and **hard-refresh** the browser (Ctrl+F5). The
    client bundle is read once at app boot; the panel tab bar now shows the
    version badge (e.g. `alpha.11`) so you can confirm the new build loaded.
  - the **desktop** target loads a pinned *generation snapshot*, which
    refreshes when dsh-desktop launches (close the app first, then
    `install.bat -Target desktop`; `-Force` if the version did not change).
- The desktop app's Safe Mode intentionally blocks third-party plugins; the
  normal profile loads them.
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
ARCHITECTURE.md        deep dive: plugin model, Files geometry/data flow, installer
LICENSE                MIT license (vecnode)
SECURITY.md            security policy: supported line, private reporting, hardening
packages/<bundle>/     one standalone dsh bundle (package.json + cordis.patch.yml + lib/)
  lib/index.js         Node half (may be a no-op row so the client bundle ships)
  lib/client.js        Browser half (module-table bundle; no build step)
scripts/               install-all.ps1/.bat, uninstall-all.ps1/.bat
.dsh-version.json      the pinned harness line + per-package versions
install.bat            double-click installer  |  uninstall.bat  double-click remover
```
