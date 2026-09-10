# Compatibility

The pack targets the harness line DeepSeek ships to the raw web install
(`npx @deepseek-ai/dsh web`). DSH Desktop is not supported by this pack.

## Current pin

| | |
|---|---|
| `@deepseek-ai/dsh` | `0.1.5-rc.1` |
| Install target | the web profile only (`$DSH_HOME\profiles\web`) |
| Right-sidebar seam | **shipped** - `@deepseek-ai/dsh-client-ui-sidebar-right` provides the `sidebarRightTabs` registry, the `sidebarRight` controller and the keyed `sidebar.right.pane.tab` seats |

## What this means for the plugin

- **dsh-editor** registers a **tab type** into the product's own right Sidebar:
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
- The workspace tree it opens files from is the product's own Files tab
  (`@deepseek-ai/dsh-client-ui-sidebar-files`) over `remote.workspaceFiles`.
  That Remote is read-only, so saving goes through the plugin's own
  authenticated route; the session's workspace root is resolved host-side from
  the live session header or session persistence.
- The pack's **own Files panel is retired**: `dsh-files` (row `files`) and its
  pre-alpha.10 name `dsh-focus` are pruned from every profile by the installer.

## Upgrading the pack when DSH moves

1. Bump `dsh` in `.dsh-version.json` (and each package's tested note).
2. Re-run `install.bat -Force` to re-add bundles under the new CLI pin.
3. If a core API moved (registry shape, seat names, framework props, route
   registration), adapt the affected package and bump its alpha version.
4. Re-run `uninstall.bat` on machines that should drop the old version first.

## Renames and retirements within the pack

- **alpha.9 → alpha.10**: `dsh-focus` (row `focus`) was renamed to `dsh-files`
  (row `files`).
- **editor alpha.1 → alpha.2**: `dsh-files` was retired outright - the harness
  now ships the Files tab natively, and the editor became a tab type of the
  native right Sidebar instead of a panel inside the pack's own dock.
- **installer alpha.2**: the DSH Desktop target was removed; the pack installs
  into the web profile only.

  Installers prune both retired bundle names; upgrade by re-running
  `install.bat`, then restart the app and hard-refresh the browser.

## Alpha policy

Every package under `packages/` ships with an `-alpha.<n>` suffix. "Stable"
promotion happens only when the owner says so (edit the package `version`,
`.dsh-version.json`, and this table), then re-run the installer with `-Force`.
