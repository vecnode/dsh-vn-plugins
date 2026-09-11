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
    const PLUGIN_VERSION = '0.1.0-alpha.1'
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
