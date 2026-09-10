# dsh-rightbar (alpha.1)

**The pack's own right bar** — the right-hand column of the DeepSeek Harness
web GUI: the tab strip with its "+" add control, the docking panel with split /
float / fullscreen, the header expand button, the **Start** (guide) page, the
tab-type registry other plugins register into, and the keyed tab body/title
seats. Alpha.

## What "the pack owns it" means

The right bar is a **fork**: `lib/client.js` is a byte-for-byte copy of the
shipped `@deepseek-ai/dsh-client-ui-sidebar-right` bundle (same harness line as
`.dsh-version.json`'s `dsh` pin), with a generated banner and the module-table
id rewritten to `dsh-rightbar`. The bundle layer then **hard-disables the two
core rows** and inserts the pack's:

```yaml
- id: ui-sidebar-right
  disabled: true
- id: ui-sidebar-files
  disabled: true
- insert:
    - id: rightbar
      name: 'dsh-rightbar'
```

So exactly one bar is mounted, and it is this package — the code can be changed
here without touching any DeepSeek core file. The shipped
`@deepseek-ai/dsh-client-ui-sidebar-documentpreview` row is deliberately left
alone: it only consumes the `sidebarRightTabs` service and the
`sidebar.right.pane.tab` seat, which this copy provides under the same names.

## The contract other plugins use

Unchanged from the shipped bar (that is the point of a byte-for-byte fork):

- **Registry** (cordis service `sidebarRightTabs`):
  `register({ id, kind, patterns?, priority?, canOpen?, title(address), guide? })`
  — `id` is also the slot key of the plugin's body/title.
- **Controller** (cordis service `sidebarRight`): `openResource(address, opts)`,
  `openTab(kind, opts)`, `close`, `focus`, `split`, `float`, `dock`,
  `isExpanded`, `toggleExpanded`.
- **Seats**: `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title`
  (keyed by the definition id), `sidebar.right.tab.guide` (chain),
  `sidebar.right.tab.menu.item` (list), plus the `rightbar` /
  `rightbar.session` panel seats and the `conversation.session.header.corner`
  expand button.
- **The "+" control** opens the Start page, which lists each registered type's
  `guide` entries; picking one calls `openTab(kind, { replaceTab: true })`.

`dsh-rightbar-files` (the Files tab) and `dsh-editor` (the editor tab) are the
pack's own tab types on top of this bar.

## Re-syncing the fork

When the pinned harness line moves:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-vendored.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-vendored.ps1 -Check
```

The script finds the harness `node_modules` (profile first, then the npx
cache), copies each forked bundle, rewrites the module id, stamps the banner and
prints hashes. `-Check` reports drift without writing (exit 1 when out of
sync). If the bar's slot/service surface changed in the new line, review the
diff before installing — a fork does not silently track upstream.

## Layout

```
cordis.patch.yml   bundle layer: disables the core bar + Files rows, inserts 'rightbar'
lib/index.js       Node half: no-op row so the browser bundle ships
lib/client.js      GENERATED vendored bar (do not edit; re-sync instead)
```
