# Compatibility

The pack targets the harness line DeepSeek ships to the raw web install
(`npx @deepseek-ai/dsh web`). DSH Desktop is not supported by this pack.

## Current pin

| | |
|---|---|
| `@deepseek-ai/dsh` | `0.1.5-rc.1` |
| Forked from | the same `0.1.5-rc.1` line (`.dsh-version.json`'s `vendoredFrom`) |
| Install target | the web profile only (`$DSH_HOME/profiles/web`) |
| Host platforms | Windows (PowerShell 5.1 or 7) and macOS / Linux (POSIX shell + Node.js and npm/npx - no PowerShell); the plugins themselves are plain JS and the only OS-specific code is the file-browser launcher |
| Master | **`dsh-vn-master`**, deliberately blank - the bundle layer plus one no-op `master` row; no client half, no service, no inject edge and no core-row disables |
| Right bar | **owned by the pack** - `dsh-rightbar` / `dsh-rightbar-files` are forks of `@deepseek-ai/dsh-client-ui-sidebar-right` / `-sidebar-files`, and the core rows `ui-sidebar-right` / `ui-sidebar-files` are disabled |
| Open In file managers | **owned by the pack** - `dsh-open-in-app` forks `@deepseek-ai/dsh-client-ui-open-in-app` (row `ui-open-in-app` disabled) and launches the OS file browser directly |

## What this means for the plugin

- **dsh-vn-master** is the pack's master and is **deliberately blank**: one no-op
  `master` row plus the bundle layer, no `dsh.client`, no service, no `inject`
  edge and no core-row disables. It is installed last (its name sorts last and
  `dsh plugin add` appends), so it is the profile's final layer - the slot for
  pack-wide patches. Because it publishes and consumes nothing, it cannot enter
  or disturb the right bar's tab-type chain.
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
  Remote is read-only, so saving (and creating a new file from a blank editor
  tab) goes through the plugin's own authenticated route; the session's
  workspace root is resolved host-side from the live session header or session
  persistence.
- **dsh-modal** provides the shared `modals` client service the editor's save-as
  dialog uses. It owns no slot and no ordering edge, and the editor resolves it
  lazily (falling back to the browser's own prompt), so neither plugin requires
  the other to be installed.
- **dsh-themes** adds the conversation header's Themes button. It contributes
  one occupant to the shipped `conversation.session.header.utilities` list at
  `order: -20` (left of Open In at `-10`) and drives the shipped
  `@deepseek-ai/dsh-client-ui-theme` service (`getTheme` / `setTheme` / the
  `theme/change` event, resolved lazily) - so the button and
  Settings → General → Appearance are the same preference. The editor reads the
  same service for its own light/dark CodeMirror palette. It also injects the
  pack's appearance overrides: the **Markdown paper**, one rule that re-declares
  ui-theme's own light declarations on the shipped preview's
  `[data-document-markdown]` root, so the rendered Markdown view stays white in
  the dark theme.
- The shipped `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` row stays
  enabled: it only consumes `sidebarRightTabs` and the keyed seat, so the
  code/image/PDF/HTML previews keep working inside the pack's bar, and the editor
  names its kind (`text`, read from the registry) for **Preview**. The pack's
  **first-generation Files panel is retired**: `dsh-files` (row `files`)
  and its pre-alpha.10 name `dsh-focus` are pruned from the profile.

## Upgrading the pack when DSH moves

1. Bump `dsh` in `.dsh-version.json` (and each package's tested note).
2. Re-run `scripts/sync-vendored.ps1` (then review the diff: a patched fork's
   patch list fails loudly when the core code it patches moved).
3. Re-run the installer with `-Force` to re-add bundles under the new CLI pin.
4. If a core API moved (registry shape, seat names, framework props, route
   registration), adapt the affected package and bump its alpha version.
5. Re-run the uninstaller on machines that should drop the old version first.

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
  bar's bundle layer hard-disables the two core rows so only the pack's
  copies run. Re-sync the fork with `scripts/sync-vendored.ps1` after a
  harness-line bump (see `ARCHITECTURE.md` §4).
- **editor alpha.4 / modal alpha.1 / open-in-app alpha.1**: the editor starts
  blank documents and names new files through the new shared `modals` dialog;
  the Open In file-manager entries moved to the pack's own cross-platform
  launcher, so `ui-open-in-app` is disabled and `native-open-in-app` runs
  instead.
- **os-neutral alpha**: no version bumps - the launchers gained macOS/Linux
  twins (`install.sh` / `uninstall.sh`, `scripts/*.sh`) and the PowerShell
  scripts stopped assuming Windows; installed profiles are unaffected.
- **editor alpha.5 / themes alpha.1**: the editor's CodeMirror palette follows
  the app's light/dark appearance (oneDark only while the app is dark) and
  re-themes live, and the new **dsh-themes** bundle adds the header button that
  switches Light / Dark / System. New package, so the first install after this
  change needs a plain `install.bat` / `./install.sh` run or `-Force`.
- **editor alpha.6 / themes alpha.2**: **Markdown opens editable** in the editor
  (it is text) with a toolbar **Preview** button that hands the file to the
  rendered view by naming the shipped preview's registry kind; and
  **dsh-themes** carries the **Markdown paper**, which keeps that rendered view
  white in the dark theme by re-declaring ui-theme's own light declarations on
  it. No new packages, no core rows touched.
- **editor alpha.7 / shell-installer alpha**: the rendered Markdown page now
  carries an **Edit** button (the editor's own document body, shadowing the
  shipped one at a lower slot priority), so **Preview is a toggle**: Editor →
  Preview → Edit → Editor on the same tab and file. Separately, `install.sh` /
  `uninstall.sh` and `scripts/install-all.sh` / `uninstall-all.sh` are **real
  POSIX shell implementations** now - Node.js + npm/npx only - instead of
  wrappers around PowerShell, so macOS/Linux hosts no longer need PowerShell at
  all; the `.ps1` half stays the Windows path (`install.bat`), and
  `scripts/sync-vendored.ps1` remains PowerShell-only maintainer tooling.

- **master alpha.1 (new package)**: the pack gained a master bundle of its own,
  **`dsh-vn-master`**, and it is deliberately **blank** - the bundle layer plus
  one no-op `master` host row, with no `dsh.client`, no published service, no
  `inject` edge and no core-row disables. The right bar therefore stops being the
  pack's base and keeps only bar responsibilities; pack-wide patches now belong
  to the master, whose layer is installed last (its name sorts last and
  `dsh plugin add` appends) and is consequently the profile's final word per row.
  Nothing about the bar's tab-type chain changes: `sidebarRightTabs` /
  `sidebarRight` stay in the generated fork, and the `ui-sidebar-right` /
  `ui-sidebar-files` disables stay in `dsh-rightbar`, next to the rows they
  replace. New package, so the first install after this change needs a plain
  `install.bat` / `./install.sh` run or `-Force`.

  Installers prune both retired bundle names; upgrade by re-running
  `install.bat` / `./install.sh`, then restart the app and hard-refresh the
  browser.

## Alpha policy

Every package under `packages/` ships with an `-alpha.<n>` suffix. "Stable"
promotion happens only when the owner says so (edit the package `version`,
`.dsh-version.json`, and this table), then re-run the installer with `-Force`.
