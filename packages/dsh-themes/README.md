# dsh-themes (alpha.1)

**Themes** adds one small control to the DeepSeek Harness web GUI's conversation
header: a button, the size and dress of the header's other icon buttons, sitting
immediately **left of the shipped "Open In…" control**. Pressing it opens a menu
with the three appearances the product already offers — **Light**, **Dark** and
**System** — and its glyph shows which one is active. Alpha.

It is a thin control, not a second theme system:

- the **preference** stays owned by the shipped
  `@deepseek-ai/dsh-client-ui-theme` — its `theme` client service persists the
  choice in the `ui-theme` settings namespace, resolves `system` through
  `prefers-color-scheme`, and ui-layout applies every snapshot to the document
  (`body[data-ds-dark-theme]` + the `--dsw-*` tokens);
- this bundle only **reads** the published snapshot and calls `setTheme(id)`,
  exactly like the Settings → General → **Appearance** row. Switching here
  updates Settings, and switching in Settings updates this control: there is one
  preference, one persistence path, and one palette.

## Where it sits

The Session header is composed from slots
(`conversation.session.header.{actions,utilities,corner}`). This control is one
occupant of the **utilities** list:

| Occupant | Order | Position |
|---|---|---|
| **Themes** (this package) | `-20` | first — left of Open In |
| Open In… (`open-in-app` / the pack's `dsh-open-in-app`) | `-10` | next |
| Session log download (`session-log-export`) | *(default 0)* | after that |

`-20` is the whole placement: the utilities list renders in ascending order, so
a lower order simply renders further left. Nothing shipped is patched and no
existing row's order is changed.

## Layout

```
cordis.patch.yml   bundle layer: inserts the 'themes' row (nothing else patched)
lib/index.js       Node half: a no-op row, so the client bundle joins the boot graph
lib/client.js      Browser half: the header button + menu, and the snapshot reader
```

## Behaviour worth keeping

- **The service is optional, lazily resolved.** `theme` is read through
  `ctx.get('theme')` at use time and never declared as a hard dependency, so a
  profile that never mounts ui-theme keeps its header: the button renders
  disabled with "The theme service is unavailable" instead of blocking another
  plugin's activation.
- **Live, not sticky.** The control subscribes to ui-theme's `theme/change`
  event, so a switch made in Settings — or an OS flip while the preference is
  `system` — repaints the glyph. It needs no DOM observation of its own: the
  resolved palette is not this control's business, only the preference is.
- **The glyph follows the persisted preference**, not the resolved palette —
  `System` stays visible as the choice it is, the same thing the Settings cubes
  highlight.
- **Same switch, both surfaces.** Because the write goes through
  `theme.setTheme(id)`, no second copy of the preference (and no second
  persistence path) exists to drift.

## Install / uninstall

The repo launcher (`install.bat` on Windows, `./install.sh` on macOS/Linux)
auto-discovers this package — it is a standard `dsh.bundle`. Adding a package
changes the profile's bundle set, so the first install after this package
appeared needs `-Force`; after that a plain run is enough. The web profile links
it into this repo, so code edits only need a restart of
`npx @deepseek-ai/dsh web` plus a hard browser refresh.
