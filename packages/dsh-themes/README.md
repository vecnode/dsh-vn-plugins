# dsh-themes (alpha.6)

**Themes** adds one small control to the DeepSeek Harness web GUI's conversation
header: a button, the size and dress of the header's other icon buttons, sitting
immediately **left of the shipped "Open In…" control**. Pressing it opens a menu
with the three appearances the product already offers — **Light**, **Dark** and
**System** — and its glyph shows which one is active. Alpha.

It also carries the pack's **appearance overrides** — rules that hold one surface
on a fixed palette or a fixed shape whatever the app theme is. The first is the
**Markdown paper** (alpha.2): the rendered Markdown view stays white in the dark
theme. The second is the **Markdown chrome** (alpha.3): that same page has exactly
one viewer, so the preview header's viewer menu is hidden on Markdown tabs. The
third is the left column's **top bar** (alpha.4): the sidebar's branding row
becomes the same 76px band, ending in the same hairline, that the middle and right
columns open with — and, since alpha.6, that row wears the pack's own **VN
branding** (a 24px black disc and the text *VN Harness*) instead of the shipped
fish and wordmark. See below. All of them are plain engine-neutral CSS, so they
hold in whichever browser the Web GUI is opened in.

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

## The Markdown chrome (alpha.3)

A rendered Markdown page in this pack has exactly **one** viewer, but the shipped
preview header builds its viewer menu out of *every* candidate implementation it
resolved for the file: the Markdown body plus the shipped **plain-text** fallback.
A Markdown tab therefore offered "Markdown" / "Plain text", and the second entry is
never what the pack wants — plain text is what the editor's own text surface is for,
and the deliberate way there is the **Edit** button the editor's document body draws
on the page.

So the menu is hidden on Markdown tabs:

```css
body [data-document-preview="@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown"]
  [data-document-viewer-menu]{display:none}
```

- **Scoped by renderer, not by guesswork.** The preview stamps the selected
  implementation's id into `data-document-preview` on the document root, so the rule
  matches the shipped Markdown id alone and a code or plain-text preview keeps its
  menu (there the choice is real, and the pack has no opinion about it).
- **Static CSS, installed once.** Unlike the paper there is no palette to read, so a
  single install at activation is enough. It gets its own style tag
  (`dsh-themes/markdown-chrome.css`) so it does not depend on the paper's read
  succeeding.
- **Only the header control goes.** The path, the reload tool and the document
  itself are untouched, as is the page's **Edit** button.

## The left column's top bar (alpha.4, gap alpha.5, branding alpha.6)

The frame opens with one band per column, and every column's band ends in the same
hairline at **y=76**:

| column | its band | its line |
|---|---|---|
| left | `.hHd-Xa_logoRow` — was a vertically centred 60px row under the root's 6px padding, so it ended at 66 | **none at all** |
| middle | the conversation header (`min-height:76px`, `padding:10px 28px 0 20px`) | `.5px solid var(--dsw-alias-border-l3)` at 76 |
| right | the docking kit's 38px tab strip, then the open tab's own 38px header (the shipped Files tab) | the same hairline at 38+38 = **76** |

The left column was the odd one out twice over: no rule under its branding row, and
a collapsed rail that changed **both** the root's top padding (6px → 18px) and the
row's height (60px → 36px) — so anything drawn under that row moved with the
toggle. The override gives the branding row the other two columns' band, in both
rail states:

```css
html .hHd-Xa_root.hHd-Xa_collapsed{padding-top:6px}
html .hHd-Xa_root .hHd-Xa_logoRow{
  height:70px;                       /* 6px root padding + 70 = the 76px line */
  margin:0 -12px 8px;                /* rule to both edges; 8px under it       */
  padding:4px 12px 35.5px 16px;      /* leaves a 30px content strip at the top */
  align-items:center;
  border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18));
}
html .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_logoRow{margin:0 -10px 12px;padding:1px 10px 32.5px}
```

- **The band, not the row.** The `4px` top / `35.5px` bottom split leaves a **30px**
  content strip at the band's top — the strip the conversation's own `titleRow`
  occupies — so the fish mark, the brand name and the collapse control sit **on**
  the top bar with a common centre at the frame's **y=25**, level with the
  conversation title, instead of being centred in a 60px row.
- **Nothing moves when the rail collapses.** The rail keeps the frame's own 6px
  top padding and its row is the same 70px band (its strip is 36px, the rail
  toggle's own size, centred on the same y=25), so the hairline stays at y=76 and
  the icon does not jump.
- **Edge to edge.** The row bleeds past the root's inline padding by exactly that
  padding (12px open, 10px in the rail), so the left line meets the middle line and
  the column's own vertical border as one continuous rule.
- **Breathing room under the line** (alpha.5). The row's bottom edge *is* the
  hairline, so its bottom margin is the gap before **New session** — the core's own
  8px when the sidebar is open and 12px in the rail. Zeroing that margin (as the
  alpha.4 rule did) left the button flush against the rule.
- **Pinned, and harmless if it drifts.** The selectors are the sidebar module's
  hashed class names, which belong to the harness line in `.dsh-version.json`
  (0.1.5-rc.1). On a bump that renames them this matches nothing — a no-op, never a
  broken layout — and the fix is to re-read the new names, not to add `!important`.
- **Static, installed once.** No palette to read beyond the border token, which
  carries a literal fallback for a profile that never mounts ui-theme, so it gets
  its own tag (`dsh-themes/left-topbar.css`) and needs no `theme/change` refresh.

### The VN branding (alpha.6)

The same rule set also replaces what that row *shows*: the product's mark and name
become a plain **24px black disc** and the text **VN Harness**.

```css
/* hide whatever occupies the brand slots, then draw the replacements */
html .hHd-Xa_root .hHd-Xa_brandMark>*,
html .hHd-Xa_root .hHd-Xa_brandName>*,
html .hHd-Xa_root .hHd-Xa_railMark>*{display:none!important}
html .hHd-Xa_root .hHd-Xa_brandMark::before,
html .hHd-Xa_root .hHd-Xa_railMark::before{
  content:"";width:24px;height:24px;border-radius:50%;background:#000;flex:none;display:block
}
html .hHd-Xa_root .hHd-Xa_brandName::before{content:"VN Harness"}
```

- **An override, not a slot registration.** The mark and the name are slots —
  `sidebar.brand.mark` and `sidebar.brand.name`, both **`single`** — and the
  shipped `@deepseek-ai/dsh-client-ui-brand-official` row already occupies both.
  Registering our own would be a fight over a one-occupant seat, and the row is
  `aria-hidden` decoration inside the band this package already owns.
- **It hides children, not an `<svg>`.** The shipped brand plugin wraps each
  occupant in `<div data-slot="sidebar.brand.mark" style="display: contents">`
  (verified in the running app), so the rule targets the children — which also
  covers the layout's own `FishLogo` fallback, used when no brand plugin is
  mounted at all. `!important` is what beats that inline `display: contents`.
- **Both rail states.** The collapsed rail draws the mark alone, in its own
  element (`.hHd-Xa_railMark`), and gets the same disc.
- **The disc is plain black**, as asked: against the dark theme's sidebar fill it
  reads as a dark dot. One line here changes it if that is ever wanted.
- Verified in the running app: the shipped art computes to `display:none`, and the
  disc computes to `24px × 24px`, `border-radius:50%`, `rgb(0,0,0)`, with the name
  reading `"VN Harness"` — in the wide row and in the rail.

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
                   the appearance overrides (the Markdown paper, the Markdown
                   chrome, and the left column's top bar)
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
