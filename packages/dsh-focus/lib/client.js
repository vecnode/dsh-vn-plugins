/**
 * dsh-focus - browser half.
 *
 * Renders the "Focus" panel on the right edge of the DeepSeek Harness Web UI
 * (rc.1 line), visually mirroring the left navigation panel: a full-height
 * column that collapses into a slim rail with an expand/collapse control.
 *
 * The panel lives in the `shell.overlay` seat the core layout declares (an
 * empty full-frame layer) so it needs no DOM surgery and no core slot
 * takeover. If that seat can not be registered for any reason, a plain-DOM
 * fallback panel is mounted instead, so the panel always appears.
 *
 * Current content (alpha iteration per owner):
 *   - a visible "lorem ipsum" placeholder so the panel/rail mechanics can be
 *     verified at a glance,
 *   - below it, the conversation folder list (session + cwd via ctx.sessions;
 *     entries via ctx.remote.fileReferences - the same kind-aware, cwd-scoped
 *     remote the `@` file menu uses) when a conversation with a working
 *     folder is selected.
 *
 * The bundle follows the module-table format of every core client package:
 * `window.__ModuleLoader__.load({ id, factory })` with a CJS-style factory.
 * No build step.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-focus',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useSyncExternalStore } = React

    // ---------------------------------------------------------------------
    // Styles - injected once, keyed like core css-module tags. Uses the same
    // design tokens the rest of the GUI consumes (with neutral fallbacks).
    // ---------------------------------------------------------------------
    const css = `
.dsf-dock{position:absolute;top:0;right:0;bottom:0;width:min(360px,calc(100vw - 300px));min-width:240px;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);border-left:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25));box-shadow:-6px 0 16px rgba(0,0,0,.05);z-index:2;overflow:hidden}
.dsf-head{display:flex;align-items:center;gap:8px;padding:12px 12px 10px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.15));flex:none}
.dsf-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#1f1f1f);letter-spacing:.01em;white-space:nowrap}
.dsf-badge{margin-left:2px;font-size:10px;line-height:16px;font-weight:500;border-radius:8px;padding:0 6px;color:var(--dsw-alias-label-tertiary,#8a8a8a);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-headSpacer{flex:1}
.dsf-act{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dsf-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-scroll{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 16px}
.dsf-lorem{margin:0 0 6px;font-size:12.5px;line-height:20px;color:var(--dsw-alias-label-secondary,#555)}
.dsf-sectionTitle{margin:14px 0 6px;font-size:11px;line-height:16px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}
.dsf-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:8px 2px;text-align:left}
.dsf-crumb{display:flex;align-items:center;gap:6px;padding:2px 0 6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsf-crumbLink{color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;background:none;border:0;padding:0;font:inherit}
.dsf-crumbLink:hover{color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-body{display:flex;flex-direction:column;gap:1px}
.dsf-row{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:3px 6px;height:27px;color:var(--dsw-alias-label-primary,#1f1f1f);cursor:pointer;font:inherit;flex:none}
.dsf-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsf-rowIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,#888)}
.dsf-rowDir .dsf-rowIcon{color:#e8a33d}
.dsf-rowName{flex:1;min-width:0;font-size:12.5px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-chev{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999);border-top:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.12))}
.dsf-showHidden{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px}
.dsf-showHidden:hover{color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-rail{position:absolute;top:0;right:0;bottom:0;width:46px;display:flex;flex-direction:column;align-items:center;padding-top:10px;gap:6px;background:var(--dsw-alias-bg-base,var(--dsw-specific-sidebar-fill,#f7f7f8));border-left:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.2))}
.dsf-railBtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dsf-railBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-railLabel{writing-mode:vertical-rl;font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-tertiary,#999);margin-top:10px;text-transform:uppercase}
.dsf-error{color:var(--dsw-alias-state-error-primary,#d3382c);font-size:12px;line-height:18px;padding:8px 2px;word-break:break-word}
`
    const CSS_TAG = 'dsh-focus/focus.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-focus'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // ---------------------------------------------------------------------
    // Small helpers / icons
    // ---------------------------------------------------------------------
    const h = React.createElement

    function IconChevronsLeft() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M9.5 3.5 5 8l4.5 4.5M13 3.5 8.5 8 13 12.5' }),
      )
    }

    function IconChevronsRight() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M6.5 3.5 11 8l-4.5 4.5M3 3.5 7.5 8 3 12.5' }),
      )
    }

    function IconFolder() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'currentColor', 'aria-hidden': true },
        h('path', {
          d: 'M1.5 3.5A1.5 1.5 0 0 1 3 2h3.1c.4 0 .78.16 1.06.44l.94.94H13a1.5 1.5 0 0 1 1.5 1.5v6.6a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-7.5Z',
        }),
      )
    }

    function IconFile() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'currentColor', 'aria-hidden': true },
        h('path', {
          d: 'M9.5 1H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 15h6a1.5 1.5 0 0 0 1.5-1.5V4.5L9.5 1Zm0 1.5 2.5 2.5H9.5v-2.5ZM5 13.5v-11H8v3.5a1 1 0 0 0 1 1h3v6.5H5Z',
        }),
      )
    }

    function IconUp() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M8 12V4M4 7.5 8 3.5l4 4' }),
      )
    }

    function normRel(path) {
      return String(path || '').replace(/^\.\//, '')
    }

    function parentOf(dir) {
      if (!dir) return ''
      const idx = dir.lastIndexOf('/')
      return idx < 0 ? '' : dir.slice(0, idx)
    }

    function shortPath(abs) {
      if (!abs) return 'no working folder'
      const parts = abs.split(/[\\/]/).filter(Boolean)
      if (parts.length > 3) return '.../' + parts.slice(-3).join('/')
      return abs
    }

    // ---------------------------------------------------------------------
    // Focus store: one instance per plugin activation.
    // ---------------------------------------------------------------------
    function createFocusStore(sessions, remote) {
      let open = true // the panel is visible by default
      let hidden = false
      let sessionId = undefined
      let cwd = undefined
      let dir = ''
      let phase = 'idle' // idle | loading | ready | error
      let error = null
      let entries = []
      let truncated = false
      let aborter = null

      const listeners = new Set()
      let snapshot = { open, phase, sessionId, cwd, dir, entries, hidden, truncated, error }

      function emit() {
        snapshot = { open, phase, sessionId, cwd, dir, entries, hidden, truncated, error }
        for (const listener of listeners) {
          try {
            listener()
          } catch (e) {
            // a throwing subscriber must not break the others
          }
        }
      }

      function fileReferences() {
        try {
          return remote && remote.fileReferences
        } catch (e) {
          return undefined
        }
      }

      async function refresh() {
        const refs = fileReferences()
        if (!refs || !sessionId || !cwd) {
          phase = 'ready'
          entries = []
          truncated = false
          error = null
          emit()
          return
        }
        if (aborter) aborter.abort()
        const controller = new AbortController()
        aborter = controller
        phase = 'loading'
        entries = []
        error = null
        emit()

        const signal = controller.signal
        const queries = [dir === '' ? '' : dir + '/']
        if (hidden) queries.push(dir === '' ? './.' : dir + '/.')

        let merged = []
        let lastErr = null
        try {
          const results = await Promise.all(
            queries.map((query) =>
              refs.list(sessionId, query, signal).then((result) => {
                if (signal.aborted) return null
                if (result && result.ok === true) return result.value || []
                if (result && result.ok === false) lastErr = result.error || 'list failed'
                return null
              }),
            ),
          )
          if (signal.aborted) return
          merged = []
          for (const batch of results) {
            if (!batch) continue
            for (const candidate of batch) {
              if (!candidate || !candidate.path) continue
              merged.push({
                name: candidate.path.split('/').pop(),
                path: normRel(candidate.path),
                kind: candidate.kind === 'directory' ? 'directory' : 'file',
              })
            }
          }
          merged.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          })
          entries = merged
          truncated = merged.length >= 1900
          phase = lastErr && merged.length === 0 ? 'error' : 'ready'
          error = phase === 'error' ? String((lastErr && (lastErr.message || lastErr.code)) || lastErr) : null
        } catch (err) {
          if (signal.aborted) return
          phase = 'error'
          error = err && err.message ? err.message : String(err)
        } finally {
          if (aborter === controller) aborter = null
        }
        emit()
      }

      function onSessionsChange() {
        let nextSessionId
        let nextCwd
        try {
          const state = sessions && sessions.list ? sessions.list.getSnapshot() : undefined
          if (state) {
            nextSessionId = state.current
            const summary = nextSessionId ? state.byId && state.byId[nextSessionId] : undefined
            nextCwd = summary ? summary.cwd : undefined
          }
        } catch (e) {
          nextSessionId = undefined
          nextCwd = undefined
        }
        if (nextSessionId !== sessionId || nextCwd !== cwd) {
          sessionId = nextSessionId
          cwd = nextCwd
          dir = ''
          if (open) refresh()
          else {
            phase = 'idle'
            entries = []
            error = null
            emit()
          }
        }
      }

      let offList = null
      try {
        if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
          offList = sessions.list.subscribe(onSessionsChange)
        }
      } catch (e) {
        offList = null
      }
      onSessionsChange()

      const face = {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getSnapshot() {
          return snapshot
        },
        openPanel() {
          if (!open) {
            open = true
            refresh()
            emit()
          }
        },
        closePanel() {
          if (open) {
            open = false
            emit()
          }
        },
        togglePanel() {
          open = !open
          if (open) refresh()
          emit()
        },
        refresh,
        openDir(path) {
          dir = normRel(path)
          refresh()
        },
        goUp() {
          dir = parentOf(dir)
          refresh()
        },
        setHidden(value) {
          const next = !!value
          if (next !== hidden) {
            hidden = next
            refresh()
          }
        },
        dispose() {
          if (offList) {
            try {
              offList()
            } catch (e) {}
          }
          if (aborter) {
            try {
              aborter.abort()
            } catch (e) {}
          }
          listeners.clear()
        },
      }
      return face
    }

    // ---------------------------------------------------------------------
    // React surface (primary). Registered into the shell.overlay seat.
    // ---------------------------------------------------------------------
    function FocusPanel(props) {
      const face = props.focus
      const state = useSyncExternalStore(face.subscribe, face.getSnapshot)

      if (!state) return null

      if (!state.open) {
        // Collapsed: a slim rail like the collapsed left panel, with the same
        // expand control.
        return h(
          'div',
          { className: 'dsf-rail', role: 'complementary', 'aria-label': 'Focus panel (collapsed)' },
          h(
            'button',
            { type: 'button', className: 'dsf-railBtn', title: 'Expand Focus panel', onClick: face.openPanel, 'aria-label': 'Expand Focus panel' },
            IconChevronsLeft(),
          ),
          h('span', { className: 'dsf-railLabel' }, 'Focus'),
        )
      }

      const hasFolder = !!(state.sessionId && state.cwd)

      return h(
        'div',
        { className: 'dsf-dock', role: 'complementary', 'aria-label': 'Focus panel' },
        h(
          'div',
          { className: 'dsf-head' },
          h('span', { className: 'dsf-title' }, 'Focus'),
          h('span', { className: 'dsf-badge' }, 'alpha'),
          h('span', { className: 'dsf-headSpacer' }),
          h(
            'button',
            { type: 'button', className: 'dsf-act', title: 'Collapse Focus panel', onClick: face.closePanel, 'aria-label': 'Collapse Focus panel' },
            IconChevronsRight(),
          ),
        ),
        h(
          'div',
          { className: 'dsf-scroll' },
          h('p', { className: 'dsf-lorem' }, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'),
          hasFolder ? h('div', { className: 'dsf-sectionTitle' }, 'Conversation folder') : null,
          hasFolder ? h(FolderList, { face, state }) : h('div', { className: 'dsf-empty' }, 'Open a conversation to see its folder here.'),
        ),
      )
    }

    function FolderList({ face, state }) {
      const crumbs = []
      if (state.dir) {
        let acc = ''
        for (const part of state.dir.split('/')) {
          acc = acc ? acc + '/' + part : part
          crumbs.push({ name: part, dir: acc })
        }
      }

      const body = []
      if (state.error) body.push(h('div', { key: 'e', className: 'dsf-error' }, state.error))
      if (state.phase === 'loading') body.push(h('div', { key: 'l', className: 'dsf-empty' }, 'Listing...'))
      if (state.dir) {
        body.push(
          h(
            'button',
            { key: 'up', type: 'button', className: 'dsf-row', title: 'Go up one folder', onClick: face.goUp },
            h('span', { className: 'dsf-rowIcon' }, IconUp()),
            h('span', { className: 'dsf-rowName' }, '..'),
          ),
        )
      }
      for (const entry of state.entries) {
        const isDir = entry.kind === 'directory'
        body.push(
          h(
            'button',
            {
              key: entry.path,
              type: 'button',
              className: 'dsf-row' + (isDir ? ' dsf-rowDir' : ''),
              title: isDir ? entry.path + '/' : entry.path,
              onClick: () => {
                if (isDir) face.openDir(entry.path)
              },
            },
            h('span', { className: 'dsf-rowIcon' }, isDir ? IconFolder() : IconFile()),
            h('span', { className: 'dsf-rowName' }, entry.name),
            isDir ? h('span', { className: 'dsf-chev' }, '>') : null,
          ),
        )
      }
      if (state.entries.length === 0 && state.phase !== 'loading' && !state.error) {
        body.push(h('div', { key: 'empty', className: 'dsf-empty' }, 'This folder has no entries here.'))
      }

      return h(
        'div',
        { className: 'dsf-bodyWrap' },
        state.dir
          ? h(
              'div',
              { className: 'dsf-crumb' },
              h('button', { type: 'button', className: 'dsf-crumbLink', onClick: () => face.openDir('') }, 'root'),
              crumbs.map((crumb, i) => [
                h('span', { key: 's' + i }, ' / '),
                h('button', { key: 'c' + i, type: 'button', className: 'dsf-crumbLink', onClick: () => face.openDir(crumb.dir) }, crumb.name),
              ]),
            )
          : null,
        h('div', { className: 'dsf-body' }, body),
        h(
          'div',
          { className: 'dsf-foot' },
          h(
            'button',
            { type: 'button', className: 'dsf-showHidden', onClick: () => face.setHidden(!state.hidden) },
            'Show hidden',
            state.hidden ? ' OK' : '',
          ),
          h('span', null, state.truncated ? state.entries.length + '+' : String(state.entries.length), ' items'),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Plain-DOM fallback (used only if slot registration is unavailable).
    // ---------------------------------------------------------------------
    function mountFallback(face) {
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:9999;pointer-events:none'

      const rail = document.createElement('div')
      rail.className = 'dsf-rail'
      rail.style.pointerEvents = 'auto'
      const expandBtn = document.createElement('button')
      expandBtn.type = 'button'
      expandBtn.className = 'dsf-railBtn'
      expandBtn.title = 'Expand Focus panel'
      expandBtn.textContent = '<<'
      const label = document.createElement('span')
      label.className = 'dsf-railLabel'
      label.textContent = 'Focus'
      rail.appendChild(expandBtn)
      rail.appendChild(label)

      const dock = document.createElement('div')
      dock.className = 'dsf-dock'
      dock.style.pointerEvents = 'auto'
      const head = document.createElement('div')
      head.className = 'dsf-head'
      const title = document.createElement('span')
      title.className = 'dsf-title'
      title.textContent = 'Focus'
      const badge = document.createElement('span')
      badge.className = 'dsf-badge'
      badge.textContent = 'alpha'
      const spacer = document.createElement('span')
      spacer.className = 'dsf-headSpacer'
      const collapseBtn = document.createElement('button')
      collapseBtn.type = 'button'
      collapseBtn.className = 'dsf-act'
      collapseBtn.title = 'Collapse Focus panel'
      collapseBtn.textContent = '>>'
      head.appendChild(title)
      head.appendChild(badge)
      head.appendChild(spacer)
      head.appendChild(collapseBtn)
      const scroll = document.createElement('div')
      scroll.className = 'dsf-scroll'
      const p = document.createElement('p')
      p.className = 'dsf-lorem'
      p.textContent =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
      scroll.appendChild(p)
      const hint = document.createElement('div')
      hint.className = 'dsf-empty'
      hint.textContent = 'The conversation folder list will appear here.'
      scroll.appendChild(hint)
      dock.appendChild(head)
      dock.appendChild(scroll)

      host.appendChild(dock)
      host.appendChild(rail)
      document.body.appendChild(host)

      const applyState = (st) => {
        dock.style.display = st.open ? 'flex' : 'none'
        rail.style.display = st.open ? 'none' : 'flex'
      }
      applyState(face.getSnapshot())
      const off = face.subscribe(() => applyState(face.getSnapshot()))
      expandBtn.addEventListener('click', () => face.openPanel())
      collapseBtn.addEventListener('click', () => face.closePanel())

      return () => {
        try {
          off()
        } catch (e) {}
        if (host.parentNode) host.parentNode.removeChild(host)
      }
    }

    // Absolute last resort when even ctx services are missing: a static panel.
    function mountBasicFallback() {
      const host = document.createElement('div')
      host.style.cssText =
        'position:fixed;top:0;right:0;bottom:0;width:320px;z-index:9999;background:var(--dsw-alias-bg-base,#fff);border-left:1px solid rgba(127,127,127,.25);padding:12px 14px;pointer-events:auto;overflow-y:auto'
      const title = document.createElement('strong')
      title.textContent = 'Focus (alpha)'
      const p = document.createElement('p')
      p.style.margin = '8px 0'
      p.textContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
      host.appendChild(title)
      host.appendChild(p)
      document.body.appendChild(host)
      return () => {
        if (host.parentNode) host.parentNode.removeChild(host)
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots', 'sessions', 'remote']

    function apply(ctx) {
      const slots = ctx.get ? ctx.get('slots') || ctx.slots : ctx.slots
      const sessions = ctx.get ? ctx.get('sessions') : undefined
      const remote = ctx.get ? ctx.get('remote') : undefined

      const disposers = []
      try {
        if (slots && sessions && remote) {
          const face = createFocusStore(sessions, remote)
          let registered = false
          try {
            // shell.overlay is declared by the core layout entry; wait for its
            // declaration, then occupy it (unoccupied in the shipped web app).
            const disposer = slots.inject('shell.overlay', () =>
              slots.register({ name: 'shell.overlay', inject: () => ({ focus: face }) }, FocusPanel),
            )
            if (typeof disposer === 'function') disposers.push(disposer)
            disposers.push(face.dispose)
            registered = true
          } catch (err) {
            ctx.logger?.warn?.('[dsh-focus] overlay seat unavailable, using fallback panel', err && err.message ? err.message : err)
          }
          if (!registered && typeof document !== 'undefined') {
            disposers.push(mountFallback(face))
            disposers.push(face.dispose)
          }
        } else if (typeof document !== 'undefined') {
          ctx.logger?.warn?.('[dsh-focus] required services missing - mounting basic fallback panel')
          disposers.push(mountBasicFallback())
        }
      } catch (err) {
        ctx.logger?.warn?.('[dsh-focus] activation failed', err && err.message ? err.message : err)
      }

      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (e) {}
        }
      }
    }

    exports.name = 'dsh-focus'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
