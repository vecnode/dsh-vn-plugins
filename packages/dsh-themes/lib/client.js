/**
 * dsh-themes - browser half.
 *
 * One small control in the conversation header: a button, the same size and
 * dress as the header's other icon buttons, sitting immediately LEFT of the
 * shipped "Open In..." control (both live in the Session header's
 * `conversation.session.header.utilities` list; Open In registers at order -10,
 * this one at -20). Pressing it opens a menu with the three appearances the
 * product already offers - Light, Dark, System - exactly the choice Settings >
 * General > Appearance presents, and the button's glyph shows which one is
 * active.
 *
 * The preference itself is NOT owned here. `@deepseek-ai/dsh-client-ui-theme`
 * owns it (`theme` client service): it persists the choice in the `ui-theme`
 * settings namespace, resolves `system` through `prefers-color-scheme`, and
 * ui-layout applies each snapshot to the document (`body[data-ds-dark-theme]`,
 * the `--dsw-*` tokens). This bundle only reads the published snapshot and
 * calls `setTheme(id)`, so the header control and the Settings row are the same
 * switch, and a change made in either place lands in the other.
 *
 * The service is resolved lazily (`ctx.get('theme')`), never declared in the
 * editor-style hard dependency list: a profile that never mounts ui-theme keeps
 * its header intact, and this control simply reports that the theme service is
 * unavailable instead of taking another plugin's activation down with it.
 *
 * It also carries the pack's appearance OVERRIDES - rules that hold one surface
 * on a fixed palette regardless of the app theme, or give a core surface the
 * frame's own dress. The first (alpha.2) is the
 * Markdown paper: the RENDERED Markdown view the shipped document preview draws
 * keeps a white page in the dark theme, by re-declaring ui-theme's own light
 * declarations on its root (see the paper section below). The second (alpha.3) is
 * the Markdown **chrome** override: a rendered Markdown page has one viewer, so
 * the preview header's viewer menu - which the shipped implementation fills with
 * "Markdown" and the plain-text fallback - is hidden on Markdown tabs (the way
 * to the editable surface is the editor's own **Edit** button on the page). The
 * third (alpha.4) is the left column's **top bar**: the sidebar's branding row
 * becomes the same 76px band, ending in the same hairline, that the middle and
 * right columns already open with (see the top bar section below). All three are
 * plain engine-neutral CSS, so they hold in every browser the Web GUI runs in.
 *
 * Module-table format of every core client package; no build step.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-themes',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const { Menu, Tooltip } = primitives

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    /** The slot id of this occupant in the header utilities list. */
    const THEMES_ID = 'dsh-themes'
    /** Version marker, logged at activation so a fresh bundle is easy to verify. */
    const PLUGIN_VERSION = '0.1.0-alpha.6'
    /** The client service (@deepseek-ai/dsh-client-ui-theme) that owns the preference. */
    const THEME_SERVICE = 'theme'
    /** The Session header's utilities slot (the group the Open In control sits in). */
    const HEADER_SLOT = 'conversation.session.header.utilities'
    /** Order of the shipped Open In control in that slot; this one sits to its left. */
    const OPEN_IN_APP_ORDER = -10
    /** This control's order: below Open In's, so the list renders it first. */
    const HEADER_ORDER = -20
    /** The locale namespace owning this control's copy. */
    const LOCALE_NS = 'themes'

    // ---------------------------------------------------------------------
    // Styles - the header's own icon-button dress (28px square, 28px radius,
    // 6px padding, a 15px glyph), so this control is the size of the ones
    // beside it in both appearances.
    // ---------------------------------------------------------------------
    const css = `
.dst-slot{display:inline-flex;align-items:center}
.dst-button{width:28px;height:28px;box-sizing:border-box;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:28px;flex:none;justify-content:center;align-items:center;padding:6px;display:inline-flex}
.dst-button svg{width:15px;height:15px}
.dst-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dst-button:focus-visible{outline:.5px solid var(--dsw-alias-state-accent,#4f8cff);outline-offset:1px}
`
    const CSS_TAG = 'dsh-themes/themes.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-themes'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // ---------------------------------------------------------------------
    // Dictionaries (the control's own copy - the product's Appearance row
    // words the same three choices, but its namespace belongs to ui-theme).
    // ---------------------------------------------------------------------
    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'theme.title': '主题',
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.system': '跟随系统',
      'theme.current': '主题：{name}',
      'theme.menu': '选择应用主题',
      'theme.unavailable': '主题服务不可用',
    }
    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      'theme.title': 'Theme',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'System',
      'theme.current': 'Theme: {name}',
      'theme.menu': 'Choose the app theme',
      'theme.unavailable': 'The theme service is unavailable',
    }

    /** The three preferences ui-theme owns, in the Settings row's order. */
    const PREFERENCES = [
      { id: 'light', label: 'theme.light', Icon: primitives.IconLightOutline16 },
      { id: 'dark', label: 'theme.dark', Icon: primitives.IconDarkOutline16 },
      { id: 'system', label: 'theme.system', Icon: primitives.IconFollowsystemOutline16 },
    ]

    /**
     * What the control renders when the theme service has not answered: the
     * product's own default preference. `revision: -1` marks it as "unknown",
     * so the first real snapshot always replaces it.
     */
    const UNKNOWN_SNAPSHOT = Object.freeze({
      preference: 'system',
      active: Object.freeze({ id: 'system', colorScheme: 'light' }),
      revision: -1,
    })

    // ---------------------------------------------------------------------
    // The Markdown paper: the RENDERED Markdown view stays on the light palette
    // in either appearance.
    //
    // The shipped document preview draws Markdown into a container marked
    // `data-document-markdown` and paints it from the `--dsw-*` tokens. Those
    // tokens are declared on `body` (light) and OVERRIDDEN on
    // `body[data-ds-dark-theme]` (dark), so a subtree cannot un-dark itself by
    // referencing them - it simply inherits the dark values. This builds one
    // rule that re-declares ui-theme's own LIGHT declarations on that container,
    // which turns it into a white page (with a light-palette code block, list
    // marker and link colour) whatever the app theme is.
    //
    // The light layer is READ from the theme plugin's stylesheets - every
    // top-level `:root` / `body` rule that is not the dark one - instead of
    // freezing today's hex values here, so a palette change on a harness bump
    // carries over on its own. If the stylesheets cannot be read, nothing is
    // injected: forcing white without the light tokens would paint light text on
    // a white page, which is worse than leaving the view on the app theme.
    // ---------------------------------------------------------------------
    /** The theme package whose stylesheets declare the palettes. */
    const THEME_PLUGIN_ID = '@deepseek-ai/dsh-client-ui-theme'
    /** The document preview's own marker on the Markdown view root. */
    const MARKDOWN_ATTRIBUTE = 'data-document-markdown'
    /** The paper rule's style-tag identity (idempotent injection). */
    const PAPER_TAG = 'dsh-themes/markdown-paper.css'
    /**
     * The shipped Markdown implementation's registry id. It is the value the
     * preview writes into `data-document-preview` on a document it is rendering
     * with the Markdown body, i.e. the handle this package's chrome override
     * scopes to (and the same constant dsh-editor pins as `MARKDOWN_BODY_KEY`).
     */
    const MARKDOWN_RENDERER_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown'
    /** The chrome override's style-tag identity (idempotent injection). */
    const CHROME_TAG = 'dsh-themes/markdown-chrome.css'

    /**
     * The custom properties one rule declares, by whichever CSSOM path the
     * engine supports: indexed declarations where custom properties are
     * enumerated (Blink/Gecko today), else the rule's own text.
     * @param rule - a CSSStyleRule.
     * @returns `[name, value]` pairs.
     */
    function ruleDeclarations(rule) {
      const out = []
      const style = rule.style
      if (style && typeof style.length === 'number') {
        for (let i = 0; i < style.length; i++) {
          const name = style[i]
          if (typeof name !== 'string' || name.slice(0, 2) !== '--') continue
          out.push([name, style.getPropertyValue(name)])
        }
      }
      if (out.length === 0 && typeof rule.cssText === 'string') {
        const open = rule.cssText.indexOf('{')
        const text = open < 0 ? '' : rule.cssText.slice(open + 1)
        for (const match of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g)) out.push([match[1], match[2]])
      }
      return out
    }

    /**
     * Collect the light custom properties ui-theme declares: the static palette
     * and the alias layer live in `body`/`:root` rules, and the dark palette in
     * `body[data-ds-dark-theme]` rules that are skipped here.
     * @returns the `name:value` declarations, or `null` when nothing was readable.
     */
    function readLightDeclarations() {
      let sheets = null
      try {
        sheets = document.styleSheets
      } catch (e) {
        return null
      }
      if (!sheets) return null
      const declarations = []
      const seen = new Set()
      for (const sheet of Array.from(sheets)) {
        let owner = ''
        try {
          const node = sheet.ownerNode
          owner = node && node.dataset ? String(node.dataset.plugin || node.dataset.pluginCss || '') : ''
        } catch (e) {
          owner = ''
        }
        // Only the theme package's own sheets carry the palettes.
        if (owner.indexOf(THEME_PLUGIN_ID) !== 0) continue
        let rules = null
        try {
          rules = sheet.cssRules
        } catch (e) {
          continue
        }
        for (const rule of Array.from(rules || [])) {
          const selector = rule && rule.selectorText
          if (typeof selector !== 'string') continue
          const flat = selector.replace(/\s+/g, '')
          if (flat !== ':root' && flat !== 'body' && flat !== 'html,body') continue
          for (const [name, raw] of ruleDeclarations(rule)) {
            const value = typeof raw === 'string' ? raw.trim() : ''
            if (name.slice(0, 2) !== '--' || value === '' || seen.has(name)) continue
            seen.add(name)
            declarations.push(name + ':' + value)
          }
        }
      }
      return declarations.length === 0 ? null : declarations
    }

    /**
     * Install (or refresh) the paper rule. Idempotent: the same tag is reused and
     * only rewritten when the declarations changed.
     * @returns whether the rule is in place.
     */
    function installMarkdownPaper() {
      if (typeof document === 'undefined') return false
      let declarations = null
      try {
        declarations = readLightDeclarations()
      } catch (e) {
        declarations = null
      }
      if (declarations === null) return false
      const paper =
        'body [' +
        MARKDOWN_ATTRIBUTE +
        ']{' +
        declarations.join(';') +
        ';background:#fff;color:var(--dsw-alias-label-primary,#1f1f1f);box-sizing:border-box;min-height:100%;padding:12px 14px}' +
        // The scrollport behind the document joins the page too, so a short
        // document does not sit on the app's dark canvas underneath. Only the
        // Markdown implementation is matched; plain-text and code previews keep
        // the app theme. Where `:has()` is unsupported the whole rule is
        // dropped, and the document itself is still white.
        'body [data-textpreview-body]:has([' +
        MARKDOWN_ATTRIBUTE +
        ']){background:#fff}'
      let tag = null
      try {
        tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(PAPER_TAG) + ']')
      } catch (e) {
        tag = null
      }
      if (!tag) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-themes'
        tag.dataset.pluginCss = PAPER_TAG
        document.head.appendChild(tag)
      }
      if (tag.textContent !== paper) tag.textContent = paper
      return true
    }

    /**
     * Install the Markdown chrome override (alpha.3). A rendered Markdown page
     * has exactly one viewer, but the shipped preview header builds its viewer
     * menu from every candidate implementation - the Markdown body plus the
     * plain-text fallback - so a Markdown tab offers "Markdown" / "Plain text".
     * On this pack that choice is noise: the editable surface is reached through
     * the **Edit** button the editor's own document body draws on the page, not
     * through a second renderer. The menu is hidden on Markdown tabs and left
     * alone everywhere else (a code/plain-text tab keeps its own menu).
     *
     * Static CSS with no palette dependency, so - unlike the paper - it is
     * installed once and does not need a refresh on `theme/change`. Scoped by
     * the renderer id the preview stamps on the document root.
     * @returns whether the rule is in place.
     */
    function installMarkdownChrome() {
      if (typeof document === 'undefined') return false
      const chrome =
        'body [data-document-preview=' +
        JSON.stringify(MARKDOWN_RENDERER_ID) +
        '] [data-document-viewer-menu]{display:none}'
      let tag = null
      try {
        tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(CHROME_TAG) + ']')
      } catch (e) {
        tag = null
      }
      if (!tag) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-themes'
        tag.dataset.pluginCss = CHROME_TAG
        document.head.appendChild(tag)
      }
      if (tag.textContent !== chrome) tag.textContent = chrome
      return true
    }

    // ---------------------------------------------------------------------
    // The left column's TOP BAR (alpha.4; the gap under the line is alpha.5).
    // The frame opens with one band per
    // column, and every column's band ends in the same hairline at y=76: the
    // conversation header is `min-height:76px` with a `.5px`
    // `--dsw-alias-border-l3` bottom border, and the right column's first line
    // is the open tab's own header (the shipped Files tab is 38px tall under
    // the 38px docking strip, which lands on that very same 76px). The left
    // column had neither: its branding row was a vertically centred 60px row
    // (so it ended at 66), and the collapsed rail changed BOTH the root's top
    // padding (6px -> 18px) and that row's height (60px -> 36px) - anything
    // drawn under it moved with the toggle.
    //
    // This gives the branding row the same band, in both rail states: the row
    // keeps a 30px content strip at its top - the strip the conversation's own
    // `titleRow` occupies - so the mark, the brand name and the collapse
    // control sit ON the top bar, level with the conversation title (a common
    // centre at the frame's y=25), and the hairline stays at y=76 whether the
    // rail is open or collapsed.
    //
    // The row's own bottom edge IS the hairline, so the row keeps a bottom
    // margin as the breathing room under it (the core's 8px open, 12px in the
    // rail): with the margin zeroed, "New session" sat flush against the rule.
    //
    // Plain, engine-neutral CSS - no `:has()`, no `corner-shape`, nothing a
    // non-Blink browser would drop - and it holds in either appearance. The
    // selectors are the sidebar module's own hashed class names, pinned to the
    // harness line in `.dsh-version.json`: on a bump that renames them this
    // matches nothing and is a no-op, never a broken layout.
    // ---------------------------------------------------------------------
    /** The top bar override's style-tag identity (idempotent injection). */
    const TOPBAR_TAG = 'dsh-themes/left-topbar.css'

    /**
     * Install the left column's top bar (alpha.4) and its VN branding (alpha.6).
     * Static CSS with no palette dependency beyond the border token itself, which
     * carries a literal fallback for a profile that never mounts ui-theme - so,
     * like the chrome override, it is installed once and needs no refresh on
     * `theme/change`.
     *
     * **Why the branding is an override and not a slot registration.** The mark
     * and the product name are SLOTS (`sidebar.brand.mark`, `sidebar.brand.name`,
     * both `single`), and the harness fills them from its own
     * `@deepseek-ai/dsh-client-ui-brand-official` plugin. Registering our own
     * occupants would mean fighting that plugin for a single-occupant slot; the
     * row is `aria-hidden` decoration, and this package already owns this exact
     * row (the band above). So the art is hidden and redrawn here, which also
     * covers the layout's OWN fallback (`FishLogo`, used when no brand plugin is
     * mounted at all): the children are hidden whatever they are, rather than
     * assuming an `<svg>` from one particular provider.
     *
     * @returns whether the rule is in place.
     */
    function installLeftTopBar() {
      if (typeof document === 'undefined') return false
      const topBar = [
        // The rail keeps the frame's own 6px top padding, so the band's height,
        // the hairline and the toggle's centre all stay put when it collapses.
        'html .hHd-Xa_root.hHd-Xa_collapsed{padding-top:6px}',
        // The band: 6px (root) + 70px = the 76px line the other two columns
        // draw. `box-sizing` is border-box, so the .5px rule sits inside the
        // 70px. The 4px / 35.5px split leaves a 30px content strip at the top,
        // and the negative inline margins run the rule to both column edges.
        // The 8px bottom margin is the breathing room the core gave the row
        // (`margin-bottom:8px`): the row's own bottom IS the hairline, so this
        // is the gap under the line, before "New session".
        'html .hHd-Xa_root .hHd-Xa_logoRow{height:70px;margin:0 -12px 8px;padding:4px 12px 35.5px 16px;align-items:center;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18))}',
        // The rail's own dress: 10px to bleed past (its root padding), a 36px
        // strip for the 36px rail toggle centred on the same y=25, and the
        // core's own 12px rail gap under the line.
        'html .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_logoRow{margin:0 -10px 12px;padding:1px 10px 32.5px}',
        // The VN branding: whatever the mark and the name hold - the shipped
        // wordmark, the fish, or the layout's own fallback label - is hidden, and
        // the disc and the product text are drawn in its place. `!important`
        // because the occupants are React-rendered art this rule must beat.
        'html .hHd-Xa_root .hHd-Xa_brandMark>*,html .hHd-Xa_root .hHd-Xa_brandName>*,html .hHd-Xa_root .hHd-Xa_railMark>*{display:none!important}',
        // The mark: a plain black disc at the slot's own 24px, in the wide row
        // and in the collapsed rail (which draws the mark alone).
        'html .hHd-Xa_root .hHd-Xa_brandMark::before,html .hHd-Xa_root .hHd-Xa_railMark::before{content:"";width:24px;height:24px;border-radius:50%;background:#000;flex:none;display:block}',
        // The name: the pack's own product text.
        'html .hHd-Xa_root .hHd-Xa_brandName::before{content:"VN Harness"}',
      ].join('')
      let tag = null
      try {
        tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(TOPBAR_TAG) + ']')
      } catch (e) {
        tag = null
      }
      if (!tag) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-themes'
        tag.dataset.pluginCss = TOPBAR_TAG
        document.head.appendChild(tag)
      }
      if (tag.textContent !== topBar) tag.textContent = topBar
      return true
    }

    // ---------------------------------------------------------------------
    // The theme snapshot as a `useSyncExternalStore` source: the service's own
    // snapshot object (stable until it changes) with a fallback, refreshed by
    // the service's `theme/change` event and once more after boot, in case
    // ui-theme provides the service a tick after this row activates.
    // ---------------------------------------------------------------------
    /**
     * @param ctx - the owning client context.
     * @returns `{ getSnapshot, getServerSnapshot, subscribe, refresh, adopt }`.
     */
    function createThemeState(ctx) {
      let snapshot = null
      const listeners = new Set()

      function serviceNow() {
        try {
          const service = ctx.get ? ctx.get(THEME_SERVICE) : undefined
          return service && typeof service.setTheme === 'function' ? service : null
        } catch (e) {
          return null
        }
      }

      function resolve() {
        try {
          const service = serviceNow()
          const value = service && typeof service.getTheme === 'function' ? service.getTheme() : null
          if (value && typeof value.preference === 'string') return value
        } catch (e) {}
        return UNKNOWN_SNAPSHOT
      }

      function publish(next) {
        const settled = next && typeof next.preference === 'string' ? next : UNKNOWN_SNAPSHOT
        if (snapshot !== null && settled.preference === snapshot.preference && settled.revision === snapshot.revision) {
          return
        }
        snapshot = settled
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (e) {
            /* a throwing subscriber must not break the others */
          }
        }
      }

      return {
        getSnapshot() {
          if (snapshot === null) snapshot = resolve()
          return snapshot
        },
        getServerSnapshot() {
          return UNKNOWN_SNAPSHOT
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        /** Re-read the service (a change event, or the service arriving late). */
        refresh() {
          publish(resolve())
        },
        /** Adopt the snapshot a change event carried. */
        adopt(value) {
          publish(value)
        },
        /** Whether the service this control needs is mounted. */
        available() {
          return serviceNow() !== null
        },
        /** The only preference write entry: ui-theme's own `setTheme`. */
        setTheme(id) {
          const service = serviceNow()
          if (!service) throw new Error('the theme service is unavailable')
          service.setTheme(id)
          // Read the accepted value back: ui-theme publishes synchronously, and
          // its `theme/change` event (adopted above) carries the same snapshot.
          publish(resolve())
        },
      }
    }

    // ---------------------------------------------------------------------
    // The control
    // ---------------------------------------------------------------------
    /**
     * The header button and its menu. The glyph follows the PERSISTED
     * preference (the same thing the Settings cubes highlight), not the
     * resolved palette, so "System" stays visible as the choice it is.
     */
    function ThemesAction(props) {
      const t = props.t
      const state = props.themeState
      const current = React.useSyncExternalStore(state.subscribe, state.getSnapshot, state.getServerSnapshot)
      const [open, setOpen] = React.useState(false)
      const available = state.available()
      const preference = current && typeof current.preference === 'string' ? current.preference : 'system'
      const entry = PREFERENCES.find((item) => item.id === preference) || PREFERENCES[2]
      const Glyph = entry.Icon
      const label = available ? t('theme.current', { name: t(entry.label) }) : t('theme.unavailable')
      const items = PREFERENCES.map((item) => ({
        id: item.id,
        label: t(item.label),
        icon: h(item.Icon, { size: 16 }),
      }))
      return h(
        Menu,
        {
          open: open && available,
          align: 'end',
          dense: true,
          selection: 'fill',
          onClose: () => setOpen(false),
          items: items,
          selectedId: preference,
          onSelect: (id) => {
            setOpen(false)
            try {
              state.setTheme(id)
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[dsh-themes] could not switch the theme', err && err.message ? err.message : err)
            }
          },
          anchor: h(
            'div',
            { className: 'dst-slot' },
            h(
              Tooltip,
              { label: label, side: 'bottom' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dst-button',
                  'data-theme-preference': preference,
                  'aria-label': label,
                  'aria-haspopup': 'menu',
                  'aria-expanded': open && available,
                  disabled: !available,
                  // A disabled control fires no pointer events for the custom
                  // tooltip, so the native one carries the reason.
                  title: available ? undefined : label,
                  onClick: () => {
                    if (!available) return
                    setOpen((value) => !value)
                  },
                },
                h(Glyph, { size: 16 }),
              ),
            ),
          ),
        },
      )
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    /** Services required to register copy and take a seat in the header. */
    const inject = ['slots', 'locale']

    function apply(ctx) {
      const state = createThemeState(ctx)
      ctx.effect(
        () =>
          ctx.locale.register(LOCALE_NS, {
            zh,
            en,
          }),
        'dsh-themes: dictionaries',
      )
      // Every accepted preference change (from this control, from Settings, or
      // from the OS while the preference is `system`) arrives here.
      if (typeof ctx.on === 'function') {
        ctx.on('theme/change', (snapshot) => {
          state.adopt(snapshot)
        })
      }
      // ui-theme may provide the service a tick after this row activates; the
      // microtask picks up the snapshot once every plugin has applied. A change
      // made later always arrives as a `theme/change` event (including the
      // namespace refetch after a reconnect), so no DOM observation is needed
      // here - the palette itself is not this control's business.
      Promise.resolve().then(() => {
        state.refresh()
      })

      // The Markdown paper copies ui-theme's own light declarations, and those
      // stylesheets may land a tick after this row (both are boot plugins): try
      // at once, again on the next tick, and once more whenever the theme
      // changes (a palette swap re-registers the sheets, so the copy is rebuilt
      // from whatever the theme declares then).
      installMarkdownPaper()
      Promise.resolve().then(() => {
        installMarkdownPaper()
      })
      if (typeof ctx.on === 'function') {
        ctx.on('theme/change', () => {
          installMarkdownPaper()
        })
      }

      // One-shot: the viewer-menu override is static CSS.
      installMarkdownChrome()

      // One-shot: the left column's top bar is static CSS too, and belongs to
      // the frame rather than to any one appearance.
      installLeftTopBar()

      try {
        ctx.effect(
          () =>
            ctx.slots.inject(HEADER_SLOT, () =>
              ctx.slots.register(
                {
                  name: HEADER_SLOT,
                  id: THEMES_ID,
                  order: HEADER_ORDER,
                  locale: LOCALE_NS,
                  inject: () => ({ themeState: state }),
                },
                ThemesAction,
              ),
            ),
          'dsh-themes: header control',
        )
        ctx.logger?.debug?.(
          '[dsh-themes] theme control registered (' +
            PLUGIN_VERSION +
            ', order ' +
            HEADER_ORDER +
            ', left of Open In at ' +
            OPEN_IN_APP_ORDER +
            ')',
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dsh-themes] activation failed', err)
        ctx.logger?.warn?.('[dsh-themes] activation failed', err && err.message ? err.message : err)
      }
    }

    exports.name = 'dsh-themes'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
