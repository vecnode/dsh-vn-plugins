# Compatibility

The pack targets the harness line DeepSeek currently ships to both the raw CLI
(`npx @deepseek-ai/dsh`) and dsh-desktop stable.

## Current pin

| | |
|---|---|
| `@deepseek-ai/dsh` | `0.1.2-rc.1` (npm `latest` / `next`) |
| dsh-desktop stable | built on the same rc.1 line |
| Right-sidebar seam | not yet released (on master / `0.1.5-alpha.1` experimental) |

## What this means for the plugins

- **dsh-files** works against the rc.1 surfaces that already exist and are
  shipped:
  - the `shell.overlay` seat declared by core `ui-layout` (empty in the shipped
    web app — no conflict, no takeover; the DOM dock re-parents into its layer
    element),
  - the `conversation.session.header.utilities` list seat (declared by core
    `ui-conversation`) — the "Files" trigger button registers there, exactly
    like the shipped "Session log" capsule (`dsh-session-log-export`),
  - `ctx.sessions` (`list.current` + `byId[id].cwd`),
  - `ctx.remote.fileReferences.list` (the `@` file-menu remote; kind-aware and
    cwd-scoped). The bundle patch raises that row's `maxResults` cap (20 → 2000)
    so folder listings aren't truncated.
- Files renders as a **dock on the right edge** (the GUI has no third-party
  right-panel seat in rc.1 — the native right sidebar with the public tab-type
  registry arrives in a later release). The moment DSH ships that seam, the
  dock is re-homed onto it; only the `client.js` mounting code changes.
- The dock is a **tab host**: Files is one Claude-style tab with a close-x;
  more panels register the same way later (each with its own descriptor and
  header trigger).

## Upgrading the pack when DSH moves

1. Bump `dsh` in `.dsh-version.json` (and each package's tested note).
2. Re-run `install.bat -Force` to re-add bundles under the new CLI pin.
3. If a core API moved (slot names, services, remotes), adapt the affected
   package and bump its alpha version.
4. Re-run `uninstall.bat` on machines that should drop the old version first.

## Renames within the pack

- **alpha.9 → alpha.10**: `dsh-focus` (row `focus`) was renamed to
  `dsh-files` (row `files`). Installers prune the old bundle name; upgrade by
  re-running `install.bat`.

## Alpha policy

Every package under `packages/` ships with an `-alpha.<n>` suffix. "Stable"
promotion happens only when the owner says so (edit the package `version`,
`.dsh-version.json`, and this table), then re-run the installer with `-Force`.
