/**
 * dsh-focus — browser half.
 *
 * Renders the "Focus" dock on the right edge of the DeepSeek Harness Web UI
 * (rc.1 line). The dock lives in the `shell.overlay` seat that the core
 * layout declares (an empty full-frame layer) so it needs no DOM surgery and
 * no core slot takeover. Content is the current conversation folder:
 *
 *   - session + cwd        -> ctx.sessions (list.current / byId[*].cwd)
 *   - folder entries       -> ctx.remote.fileReferences.list(sessionId, query)
 *                             (the same kind-aware, cwd-scoped remote the
 *                             `@` file menu uses; directory-scoped queries
 *                             list live state; entries carry kind file|dir)
 *
 * The bundle follows the module-table format of every core client package:
 * `window.__ModuleLoader__.load({ id, factory })` with a CJS-style factory.
 * Alpha: v1 shows the folder of the current conversation, one row per entry,
 * folders first — a Claude-Code-style file list.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-focus',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useSyncExternalStore, useState, useEffect } = React

    // ---------------------------------------------------------------------
    // Styles — injected once, keyed like core css-module tags. Uses the same
    // design tokens the rest of the GUI consumes (with neutral fallbacks).
    // ---------------------------------------------------------------------
    const css = `
.dsf-pill{position:absolute;top:40%;right:0;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:34px;height:64px;border:0;border-radius:10px 0 0 10px;border-right:0;cursor:pointer;color:var(--dsw-alias-label-secondary,#888);background:var(--dsw-alias-button-floating-fill,rgba(127,127,127,.12));box-shadow:0 0 0 .5px var(--dsw-alias-border-l3,rgba(127,127,127,.25));padding:0;z-index:1}
.dsf-pill:hover{color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-button-floating-hover,rgba(127,127,127,.2))}
.dsf-dock{position:absolute;top:0;right:0;bottom:0;width:min(372px,calc(100vw - 320px));min-width:240px;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));border-left:.5px solid var(--dsw-alias-border-l2,#0000);box-shadow:-8px 0 24px rgba(0,0,0,.06);z-index:2;overflow:hidden}
.dsf-head{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.2));flex:none}
.dsf-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#222);letter-spacing:.01em;white-space:nowrap}
.dsf-badge{margin-left:2px;font-size:10px;line-height:16px;font-weight:500;border-radius:8px;padding:0 6px;color:var(--dsw-alias-label-tertiary,#999);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-cwd{flex:1;min-width:0;text-align:left;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-cwd b{font-weight:500}
.dsf-act{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dsf-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary,#222)}
.dsf-crumb{display:flex;align-items:center;gap:6px;padding:4px 12px;font-size:11px;color:var(--dsw-alias-label-tertiary,#888);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsf-crumb .dsf-crumbLink{color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;background:none;border:0;padding:0;font:inherit}
.dsf-crumb .dsf-crumbLink:hover{color:var(--dsw-alias-label-primary,#222)}
.dsf-body{flex:1;min-height:0;overflow-y:auto;padding:6px 8px 8px;display:flex;flex-direction:column;gap:1px}
.dsf-row{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:3px 6px;height:26px;color:var(--dsw-alias-label-primary,#222);cursor:pointer;font:inherit;flex:none}
.dsf-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-rowSel,.dsf-rowSel:hover{background:var(--dsw-alias-interactive-bg-active,rgba(59,130,246,.14))}
.dsf-rowIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,#888)}
.dsf-rowDir .dsf-rowIcon{color:#e8a33d}
.dsf-rowName{flex:1;min-width:0;font-size:12.5px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-rowMeta{flex:none;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-chev{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:14px 10px;text-align:center}
.dsf-error{color:var(--dsw-alias-state-error-primary,#d3382c);font-size:12px;line-height:18px;padding:10px;word-break:break-word}
.dsf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 8px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999);border-top:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.12))}
.dsf-showHidden{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px}
.dsf-showHidden:hover{color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
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
    // Small helpers
    // ---------------------------------------------------------------------
    const h = React.createElement

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

    function IconRefresh() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3' }),
      )
    }

    function IconClose() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M3.5 3.5l9 9m0-9-9 9' }),
      )
    }

    function IconFocus() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 5.5 }),
        h('circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function normRel(path) {
      // Entries are workspace-cwd-relative display paths; hidden listings come
      // back with a leading "./" prefix.
      return String(path || '').replace(/^\.\//, '')
    }

    function parentOf(dir) {
      if (!dir) return ''
      const idx = dir.lastIndexOf('/')
      return idx < 0 ? '' : dir.slice(0, idx)
    }

    function displayPath(cwd, dir) {
      if (!cwd) return 'no working folder'
      const rel = dir ? '/' + dir : ''
      const shown = cwd + rel
      const parts = shown.split(/[\\/]/).filter(Boolean)
      if (parts.length > 3) return '…/' + parts.slice(-3).join('/')
      return shown
    }

    // ---------------------------------------------------------------------
    // Focus store: one instance per plugin activation.
    // ---------------------------------------------------------------------
    function createFocusStore(sessions, remote) {
      let open = false
      let autoOpened = false
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
      const EMPTY = []

      function emit() {
        snapshot = {
          open,
          phase,
          sessionId,
          cwd,
          dir,
          entries,
          hidden,
          truncated,
          error,
        }
        for (const listener of listeners) {
          try {
            listener()
          } catch (e) {
            // A throwing subscriber must not break the others.
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
        const queries = []
        // Normal (non-hidden) entries: a directory-scoped query lists the live
        // state of that directory. Root is an empty query; subfolders end in "/".
        queries.push(dir === '' ? '' : dir + '/')
        // Hidden entries need a fragment that starts with "."; directory-scoped
        // form "<dir>/." lists just dot entries of that directory.
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
          truncated = merged.length >= 1900 // remote cap is 2000/query
          phase = lastErr && merged.length === 0 ? 'error' : 'ready'
          error = phase === 'error' ? String(lastErr && (lastErr.message || lastErr.code || lastErr)) : null
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
          if (sessionId && !autoOpened && !open) {
            autoOpened = true
            open = true
          }
          if (open) {
            refresh()
          } else {
            phase = 'idle'
            entries = []
            error = null
            emit()
          }
        }
      }

      // Wire the session feed.
      let offList = null
      try {
        if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
          offList = sessions.list.subscribe(onSessionsChange)
        }
      } catch (e) {
        offList = null
      }
      // Seed from the current snapshot even without a subscription.
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
        toggle() {
          open = !open
          if (open) refresh()
          emit()
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
        refresh,
        openDir(path) {
          dir = normRel(path)
          refresh()
        },
        goUp() {
          const next = parentOf(dir)
          dir = next
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
    // React surface
    // ---------------------------------------------------------------------
    function FocusDock(props) {
      const face = props.focus
      const state = useSyncExternalStore(face.subscribe, face.getSnapshot)
      const [selected, setSelected] = useState(null)

      useEffect(() => {
        setSelected(null)
      }, [state.sessionId, state.dir])

      if (!state) return null

      if (!state.open) {
        return h(
          'button',
          { className: 'dsf-pill', type: 'button', title: 'Focus — files in the current conversation folder', onClick: face.openPanel, 'aria-label': 'Open Focus panel' },
          IconFocus(),
        )
      }

      const crumbs = []
      if (state.dir) {
        let acc = ''
        for (const part of state.dir.split('/')) {
          acc = acc ? acc + '/' + part : part
          crumbs.push({ name: part, dir: acc })
        }
      }

      const body = []
      if (!state.sessionId) {
        body.push(h('div', { key: 'n', className: 'dsf-empty' }, 'Open a conversation to see its folder.'))
      } else if (!state.cwd) {
        body.push(h('div', { key: 'n', className: 'dsf-empty' }, 'This conversation has no working folder.'))
      } else {
        if (state.phase === 'loading') {
          body.push(h('div', { key: 'l', className: 'dsf-empty' }, 'Listing…'))
        }
        if (state.error) {
          body.push(h('div', { key: 'e', className: 'dsf-error' }, state.error))
        }
        if (state.dir) {
          body.push(
            h(
              'button',
              {
                key: 'up',
                type: 'button',
                className: 'dsf-row',
                title: 'Go up one folder',
                onClick: face.goUp,
              },
              h('span', { className: 'dsf-rowIcon' }, IconUp()),
              h('span', { className: 'dsf-rowName' }, '..'),
            ),
          )
        }
        for (const entry of state.entries) {
          const isDir = entry.kind === 'directory'
          const isSel = selected === entry.path
          body.push(
            h(
              'button',
              {
                key: entry.path,
                type: 'button',
                className: 'dsf-row' + (isDir ? ' dsf-rowDir' : '') + (isSel ? ' dsf-rowSel' : ''),
                title: isDir ? entry.path + '/' : entry.path,
                onClick: () => {
                  if (isDir) face.openDir(entry.path)
                  else setSelected(isSel ? null : entry.path)
                },
              },
              h('span', { className: 'dsf-rowIcon' }, isDir ? IconFolder() : IconFile()),
              h('span', { className: 'dsf-rowName' }, entry.name),
              isDir ? h('span', { className: 'dsf-chev' }, '›') : null,
            ),
          )
        }
        if (state.entries.length === 0 && state.phase !== 'loading' && !state.error) {
          body.push(h('div', { key: 'empty', className: 'dsf-empty' }, state.hidden ? 'This folder is empty.' : 'This folder has no visible entries.'))
        }
      }

      return h(
        'div',
        { className: 'dsf-dock', role: 'complementary', 'aria-label': 'Focus — conversation folder' },
        h(
          'div',
          { className: 'dsf-head' },
          h('span', { className: 'dsf-title' }, 'Focus'),
          h('span', { className: 'dsf-badge' }, 'alpha'),
          h(
            'span',
            { className: 'dsf-cwd', title: state.cwd ? state.cwd + (state.dir ? '/' + state.dir : '') : 'no folder' },
            h('b', null, displayPath(state.cwd, state.dir)),
          ),
          h(
            'button',
            { type: 'button', className: 'dsf-act', title: 'Refresh folder', onClick: face.refresh, 'aria-label': 'Refresh' },
            IconRefresh(),
          ),
          h(
            'button',
            { type: 'button', className: 'dsf-act', title: 'Close Focus', onClick: face.closePanel, 'aria-label': 'Close' },
            IconClose(),
          ),
        ),
        state.dir
          ? h(
              'div',
              { className: 'dsf-crumb' },
              h('button', { type: 'button', className: 'dsf-crumbLink', onClick: () => face.openDir('') }, 'root'),
              crumbs.map((crumb, i) => [
                h('span', { key: 's' + i }, '/'),
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
            {
              type: 'button',
              className: 'dsf-showHidden',
              onClick: () => face.setHidden(!state.hidden),
              title: 'Show or hide dotfiles',
            },
            'Show hidden',
            state.hidden ? ' ✓' : '',
          ),
          h(
            'span',
            null,
            state.truncated ? state.entries.length + '+' : String(state.entries.length),
            ' item' + (state.entries.length === 1 ? '' : 's'),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots', 'sessions', 'remote', 'remote.fileReferences']

    function apply(ctx) {
      const slots = ctx.get('slots')
      const sessions = ctx.get('sessions')
      const remote = ctx.get('remote')

      if (!slots || !sessions || !remote || !remote.fileReferences) {
        // The web composition every Focus target rides provides these; keep a
        // visible note instead of crashing if a future version moves them.
        ctx.logger?.warn?.('[dsh-focus] required services missing — Focus dock not mounted')
        return
      }

      const face = createFocusStore(sessions, remote)

      ctx.effect?.(
        () => {
          let disposed = false
          let disposer = null
          try {
            // shell.overlay is declared by the core layout entry; wait for its
            // declaration, then occupy it (unoccupied in the shipped web app).
            disposer = slots.inject('shell.overlay', () =>
              slots.register({ name: 'shell.overlay', inject: () => ({ focus: face }) }, FocusDock),
            )
          } catch (err) {
            ctx.logger?.warn?.('[dsh-focus] could not register the shell.overlay seat', err && err.message ? err.message : err)
          }
          return () => {
            if (disposed) return
            disposed = true
            if (disposer && typeof disposer === 'function') {
              try {
                disposer()
              } catch (e) {}
            }
            try {
              face.dispose()
            } catch (e) {}
          }
        },
        'dsh-focus: dock registration',
      )
    }

    exports.name = 'dsh-focus'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
