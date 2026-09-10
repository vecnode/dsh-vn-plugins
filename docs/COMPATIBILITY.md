# Compatibility

The pack targets the harness line DeepSeek ships to the raw web install
(`npx @deepseek-ai/dsh web`). DSH Desktop is not supported by this pack.

## Current pin

| | |
|---|---|
| `@deepseek-ai/dsh` | `0.1.5-rc.1` |
| Forked from | the same `0.1.5-rc.1` line (`.dsh-version.json`'s `vendoredFrom`) |
| Install target | the web profile only (`$DSH_HOME\profiles\web`) |
| Right bar | **owned by the pack** - `dsh-rightbar` / `dsh-rightbar-files` are forks of `@deepseek-ai/dsh-client-ui-sidebar-right` / `-sidebar-files`, and the core rows `ui-sidebar-right` / `ui-sidebar-files` are disabled |

## What this means for the plugin

- **dsh-rightbar** provides the right bar (chrome, docking panel, expand button,
  Start page) and the `sidebarRightTabs` / `sidebarRight` services its tab types
  use; **dsh-rightbar-files** provides the Files tab on top of it.
- **dsh-editor** registers a **tab type** into that bar:
  - `ctx.sidebarRightTabs.register({ id, kind, patterns, priority, canOpen, title, guide })`
    (stage one: what the type is),
  - the keyed body/title seats `sidebar.right.pane.tab` and
    `sidebar.right.pane.tab.title`, registered with `key` = the definition's id
    (stage two: what a tab draws),
  - the `extension` priority band, so text files open editable rather than in
    the shipped read-only viewer; `canOpen` vetoes every extension the shipped
    previews own (md/markdown/html/images/pdf/office/archive/media/binary) and
    every path outside the session workspace,
  - a `guide` entry, which is what the tab strip's "+" control lists.
- The workspace tree it opens files from is the pack's Files tab over
  `remote.workspaceFiles` (a shipped host service, not a UI dependency). That
  Remote is read-only, so saving goes through the plugin's own authenticated
  route; the session's workspace root is resolved host-side from the live
  session header or session persistence.
- The shipped `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` row stays
  enabled: it only consumes `sidebarRightTabs` and the keyed seat, so the
  Markdown/code/image/PDF previews keep working inside the pack's bar. The
  pack's **first-generation Files panel is retired**: `dsh-files` (row `files`)
  and its pre-alpha.10 name `dsh-focus` are pruned from the profile.

## Upgrading the pack when DSH moves

1. Bump `dsh` in `.dsh-version.json` (and each package's tested note).
2. Re-run `install.bat -Force` to re-add bundles under the new CLI pin.
3. If a core API moved (registry shape, seat names, framework props, route
   registration), adapt the affected package and bump its alpha version.
4. Re-run `uninstall.bat` on machines that should drop the old version first.

## Renames, retirements and forks within the pack

- **alpha.9 → alpha.10**: `dsh-focus` (row `focus`) was renamed to `dsh-files`
  (row `files`).
- **editor alpha.1 → alpha.2**: `dsh-files` was retired outright - the harness
  now ships a right Sidebar with a Files tab, and the editor became a tab type
  registering into that bar instead of a panel inside the pack's own dock.
- **installer alpha.2**: the DSH Desktop target was removed; the pack installs
  into the web profile only.
- **rightbar alpha.1**: the pack now **owns the bar**. `dsh-rightbar` and
  `dsh-rightbar-files` are byte-for-byte forks of the shipped
  `@deepseek-ai/dsh-client-ui-sidebar-right` / `-sidebar-files` bundles, and the
  master's bundle layer hard-disables the two core rows so only the pack's
  copies run. Re-sync the fork with `scripts\sync-vendored.ps1` after a
  harness-line bump (see `ARCHITECTURE.md` §4).

  Installers prune both retired bundle names; upgrade by re-running
  `install.bat`, then restart the app and hard-refresh the browser.

## Alpha policy

Every package under `packages/` ships with an `-alpha.<n>` suffix. "Stable"
promotion happens only when the owner says so (edit the package `version`,
`.dsh-version.json`, and this table), then re-run the installer with `-Force`.
