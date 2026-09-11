# dsh-themes (alpha.2)

**Themes** adds one small control to the DeepSeek Harness web GUI's conversation
header: a button, the size and dress of the header's other icon buttons, sitting
immediately **left of the shipped "Open In…" control**. Pressing it opens a menu
with the three appearances the product already offers — **Light**, **Dark** and
**System** — and its glyph shows which one is active. Alpha.

It also carries the pack's **appearance overrides** — rules that hold one surface
on a fixed palette whatever the app theme is. The first is the **Markdown paper**
(alpha.2): the rendered Markdown view stays white in the dark theme. See below.

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

## The Markdown paper (alpha.2)

The shipped document preview draws rendered Markdown into a container marked
`data-document-markdown` and paints it from the `--dsw-*` tokens. Those tokens
are declared on `body` (light) and **overridden** on `body[data-ds-dark-theme]`
(dark), so a subtree cannot un-dark itself by referencing them — it just inherits
the dark values, which is why the rendered document used to go dark with the app.

This package injects **one rule** that re-declares ui-theme's own **light**
declarations on that container (the static palette, the ~80 alias tokens, and the
shiki token colours), then paints `background:#fff` on it:

```css
body [data-document-markdown]{ /* the theme's light layer, verbatim */ background:#fff; … }
```

- **Read, not hardcoded.** The light layer is copied out of ui-theme's own
  stylesheets at boot (every top-level `:root` / `body` rule that is *not* the
  dark one), so a palette change on a harness bump carries over by itself instead
  of freezing today's hex values here. The read uses the CSSOM and falls back to
  the rule's text where an engine does not enumerate custom properties.
- **All or nothing.** If the stylesheets cannot be read, nothing is injected:
  forcing white without the light tokens would paint light text on a white page,
  which is worse than leaving the view on the app theme.
- **Scoped.** Only the rendered Markdown document is pinned — chat Markdown, code
  previews and every other surface keep following the app theme. A second
  selector paints the preview's scrollport (`[data-textpreview-body]`, matched
  with `:has([data-document-markdown])`) white as well, so a short document does
  not sit on the app's dark canvas underneath; where `:has()` is unsupported that
  one rule is dropped and the document itself is still white. Because
  `--dsl-code-block-*` and `--shiki-*` resolve *inside* the document, the copied
  tokens also give the code blocks, inline code, links and lists their light
  styling for free.
- **Re-installed on every `theme/change`** (a palette swap re-registers the
  sheets), and once more on the tick after boot, in case ui-theme's stylesheets
  land after this row.

The editor's **Preview** button is what reaches this view for a Markdown file; the
white page is this package's doing.

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
lib/client.js      Browser half: the header button + menu, the snapshot reader, and
                   the appearance overrides (the Markdown paper)
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
