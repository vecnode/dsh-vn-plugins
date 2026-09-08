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
| [`packages/dsh-focus`](packages/dsh-focus) | **Focus** — a real right-hand column next to the chat (never overlapping it): lorem-ipsum placeholder + full-width list of the current conversation's folder with the folder path on top. | alpha `0.1.0-alpha.2` |

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
4. runs `dsh plugin --profile <profile> add <bundle>` for every package under
   `packages/` (skips already-installed bundles unless `-Force`),
5. prints next steps. It never touches API keys — add yours in
   **Settings → Models**.

Remove with **`uninstall.bat`** (same target detection). Removing the bundle
also removes its patch layer, so the `file-reference-local` row override that
dsh-focus ships is reverted automatically.

## Notes

- Plugins are **alpha** and are built against the harness line pinned in
  `.dsh-version.json` (`0.1.2-rc.1` — the current `latest`/`next` on npm and
  the line dsh-desktop stable is built on). When DSH evolves, bump the pin and
  adapt the plugins (see `docs/COMPATIBILITY.md`).
- The desktop app's Safe Mode intentionally blocks third-party plugins; the
  normal profile loads them.
- See [`docs/INSTALL.md`](docs/INSTALL.md) for the manual path and
  troubleshooting.

## Repository layout

```
packages/<bundle>/     one standalone dsh bundle (package.json + cordis.patch.yml + lib/)
  lib/index.js         Node half (may be a no-op row so the client bundle ships)
  lib/client.js        Browser half (module-table bundle; no build step)
scripts/               install-all.ps1/.bat, uninstall-all.ps1/.bat
.dsh-version.json      the pinned harness line + per-package versions
install.bat            double-click installer  |  uninstall.bat  double-click remover
```
