/**
 * dsh-focus - browser half.
 *
 * Renders the "Focus" panel as a real third column on the right of the chat,
 * mirroring the left navigation panel. It does not overlap the conversation:
 * the core layout already owns a right "details" grid track (opened/closed
 * through the cross-plugin ctx.layout service, and resizable by its own drag
 * handle). Focus occupies that track visually:
 *
 *   - on open  -> ctx.layout.openDetails()  (chat column shrinks, track widens)
 *   - closed   -> ctx.layout.closeDetails() (chat full width) + a floating
 *                 expand control on the right edge
 *   - width    -> tracked live from the frame's grid-template-columns, so the
 *                 panel follows the user's drag handle exactly
 *
 * The panel element itself lives in the empty core `shell.overlay` seat
 * (declared by ui-layout), so no core slot takeover is needed. If that seat
 * can not be registered for any reason, a plain-DOM fallback panel that
 * reserves the same track is mounted instead.
 *
 * Content (alpha iteration per owner):
 *   - a "lorem ipsum" placeholder,
 *   - below it a full-width list of the conversation folder's entries with
 *     the folder path on top (session + cwd via ctx.sessions; entries via
 *     ctx.remote.fileReferences - the same kind-aware, cwd-scoped remote the
 *     `@` file menu uses), styled with the native DSH tokens.
 *
 * Module-table format of every core client package; no build step.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-focus',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useSyncExternalStore, useState, useEffect, useRef } = React

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------
    const css = `
.dsf-root{display:contents}
.dsf-dock{position:absolute;top:0;right:0;bottom:0;width:360px;box-sizing:border-box;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);border-left:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25));overflow:hidden}
.dsf-head{display:flex;align-items:center;gap:8px;padding:11px 12px 9px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.15));flex:none}
.dsf-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#1f1f1f);letter-spacing:.01em;white-space:nowrap}
.dsf-badge{margin-left:2px;font-size:10px;line-height:16px;font-weight:500;border-radius:8px;padding:0 6px;color:var(--dsw-alias-label-tertiary,#8a8a8a);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-headSpacer{flex:1}
.dsf-act{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dsf-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-scroll{flex:1;min-height:0;overflow-y:auto;padding:6px 6px 10px 6px}
.dsf-sectionTitle{margin:8px 4px 4px;font-size:11px;line-height:16px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}
.dsf-path{margin:0 4px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;direction:ltr;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace)}
.dsf-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:6px 4px;text-align:left}
.dsf-error{color:var(--dsw-alias-state-error-primary,#d3382c);font-size:12px;line-height:18px;padding:6px 4px;word-break:break-word}
.dsf-crumb{display:flex;align-items:center;gap:2px;padding:0 4px 4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsf-crumbLink{color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;background:none;border:0;padding:0 2px;font:inherit}
.dsf-crumbLink:hover{color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-body{width:100%;display:flex;flex-direction:column}
.dsf-row{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;text-align:left;border:0;background:transparent;border-radius:6px;padding:3px 8px;height:28px;color:var(--dsw-alias-label-primary,#1f1f1f);cursor:pointer;font:inherit;flex:none}
.dsf-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsf-rowIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,#888)}
.dsf-rowDir .dsf-rowIcon{color:#e8a33d}
.dsf-rowName{flex:1;min-width:0;font-size:12.5px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-chev{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 4px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999)}
.dsf-showHidden{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px}
.dsf-showHidden:hover{color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dsf-expand{position:absolute;top:50%;right:8px;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:30px;height:56px;border:0;border-radius:10px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-button-floating-fill,rgba(127,127,127,.1));box-shadow:0 0 0 .5px var(--dsw-alias-border-l3,rgba(127,127,127,.22));padding:0;z-index:1}
.dsf-expand:hover{color:var(--dsw-alias-label-primary,#1f1f1f);background:var(--dsw-alias-button-floating-hover,rgba(127,127,127,.18))}
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
    // Icons / helpers
    // ---------------------------------------------------------------------
    const h = React.createElement

    function IconChevronLeft() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M10 3.5 5.5 8l4.5 4.5' }),
      )
    }

    function IconChevronRight() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6 3.5 10.5 8 6 12.5' }),
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

    function joinDisplay(cwd, dir) {
      if (!cwd) return ''
      return dir ? cwd.replace(/[\\/]+$/, '') + '/' + dir : cwd.replace(/[\\/]+$/, '')
    }

    // ---------------------------------------------------------------------
    // Focus store: one instance per plugin activation.
    // ---------------------------------------------------------------------
    function createFocusStore(sessions, remote) {
      let open = true // visible (and reserving the details track) by default
      let hidden = false
      let sessionId = undefined
      let cwd = undefined
      let dir = ''
      let phase = 'idle'
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
        setOpenSilently(value) {
          // Layout-driven close (track collapsed by the user/core): mirror it
          // without re-fighting the layout.
          if (open !== value) {
            open = value
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
    // Folder list (full width)
    // ---------------------------------------------------------------------
    function FolderList({ face, state }) {
      const crumbs = []
      if (state.dir) {
        let acc = ''
        for (const part of state.dir.split('/')) {
          acc = acc ? acc + '/' + part : part
          crumbs.push({ name: part, dir: acc })
        }
      }

      const rows = []
      if (state.dir) {
        rows.push(
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
        rows.push(
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

      return h('div', { className: 'dsf-body' }, rows)
    }

    // ---------------------------------------------------------------------
    // Panel component - reserves/uses the core details track.
    // ---------------------------------------------------------------------
    function FocusPanel(props) {
      const face = props.focus
      const layout = props.layout
      const rootRef = useRef(null)
      const hadPositive = useRef(false)
      const [trackWidth, setTrackWidth] = useState(360)
      const state = useSyncExternalStore(face.subscribe, face.getSnapshot)

      // Measure the frame's rightmost grid track (the details column) so the
      // panel always fills exactly the space the chat conceded, and follows
      // the user's drag handle.
      useEffect(() => {
        const rootEl = rootRef.current
        if (!rootEl || typeof window === 'undefined') return
        const layer = rootEl.parentElement // the shell.overlay layer
        const frame = layer ? layer.parentElement : null
        if (!frame) return

        const apply = () => {
          let width = 0
          try {
            const cols = window.getComputedStyle(frame).gridTemplateColumns
            const parts = cols.split(/\s+/)
            const last = parseFloat(parts[parts.length - 1])
            if (!isNaN(last)) width = Math.max(0, Math.round(last))
          } catch (e) {
            width = 0
          }
          setTrackWidth(width)
          // Only mirror a core-driven close after we have actually seen a
          // positive track width (avoids racing the very first openDetails).
          if (width >= 30) hadPositive.current = true
          else if (hadPositive.current) {
            const st = face.getSnapshot()
            if (st && st.open) face.setOpenSilently(false)
          }
        }
        apply()

        const observer = new MutationObserver(apply)
        observer.observe(frame, { attributes: true, attributeFilter: ['style'] })
        window.addEventListener('resize', apply)
        return () => {
          observer.disconnect()
          window.removeEventListener('resize', apply)
        }
      }, [face])

      // Drive the core details track with the panel state.
      useEffect(() => {
        if (!layout) return
        const st = face.getSnapshot()
        try {
          if (st.open) layout.openDetails()
          else layout.closeDetails()
        } catch (e) {}
      }, [face, layout, state.open])

      if (!state) return null

      if (!state.open) {
        // Chat is full width again; keep a floating expand control.
        return h(
          'button',
          {
            type: 'button',
            className: 'dsf-expand',
            title: 'Expand Focus panel',
            onClick: face.openPanel,
            'aria-label': 'Expand Focus panel',
          },
          IconChevronLeft(),
        )
      }

      const width = Math.max(trackWidth - 14, 0) // leave room for the drag handle
      const hasFolder = !!(state.sessionId && state.cwd)
      const fullPath = hasFolder ? joinDisplay(state.cwd, state.dir) : ''

      return h(
        'div',
        { className: 'dsf-root', ref: rootRef },
        h(
          'div',
          {
            className: 'dsf-dock',
            style: width > 0 ? { width: width + 'px' } : { width: '0px', overflow: 'hidden' },
            role: 'complementary',
            'aria-label': 'Focus panel',
          },
          h(
            'div',
            { className: 'dsf-head' },
            h('span', { className: 'dsf-title' }, 'Focus'),
            h('span', { className: 'dsf-badge' }, 'alpha'),
            h('span', { className: 'dsf-headSpacer' }),
            h(
              'button',
              { type: 'button', className: 'dsf-act', title: 'Collapse Focus panel', onClick: face.closePanel, 'aria-label': 'Collapse Focus panel' },
              IconChevronRight(),
            ),
          ),
          h(
            'div',
            { className: 'dsf-scroll' },
            h('div', { className: 'dsf-sectionTitle' }, 'Conversation folder'),
            hasFolder
              ? h('div', { className: 'dsf-path', title: fullPath }, fullPath)
              : h('div', { className: 'dsf-empty' }, 'Open a conversation to see its folder here.'),
            hasFolder ? h(FolderList, { face, state }) : null,
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Plain-DOM fallback - same behavior (reserves the details track) when
    // the React/slot path is unavailable.
    // ---------------------------------------------------------------------
    function mountFallback(face, layout) {
      // Prefer mounting inside the shell.overlay layer (its parent is the
      // layout frame whose grid defines the right track); otherwise fall back
      // to a fixed overlay on the document body.
      const layerEl = document.querySelector('[data-shell-overlay]')
      const frame = layerEl ? layerEl.parentElement : document.body

      const host = document.createElement('div')
      if (layerEl) {
        host.style.cssText = 'position:absolute;top:0;right:0;bottom:0;pointer-events:none'
      } else {
        host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:9999;pointer-events:none'
      }

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
      collapseBtn.textContent = '>'
      head.appendChild(title)
      head.appendChild(badge)
      head.appendChild(spacer)
      head.appendChild(collapseBtn)
      const scroll = document.createElement('div')
      scroll.className = 'dsf-scroll'
      const section = document.createElement('div')
      section.className = 'dsf-sectionTitle'
      section.textContent = 'Conversation folder'
      const pathEl = document.createElement('div')
      pathEl.className = 'dsf-path'
      const hint = document.createElement('div')
      hint.className = 'dsf-empty'
      hint.textContent = 'The conversation folder list will appear here.'
      scroll.appendChild(section)
      scroll.appendChild(pathEl)
      scroll.appendChild(hint)
      dock.appendChild(head)
      dock.appendChild(scroll)

      const expand = document.createElement('button')
      expand.type = 'button'
      expand.className = 'dsf-expand'
      expand.title = 'Expand Focus panel'
      expand.textContent = '<'

      host.appendChild(dock)
      host.appendChild(expand)
      ;(layerEl || document.body).appendChild(host)

      let hadPositive = false
      const measure = () => {
        let width = 0
        try {
          if (frame && frame !== document.body) {
            const cols = window.getComputedStyle(frame).gridTemplateColumns
            const last = parseFloat(cols.split(/\s+/).pop())
            if (!isNaN(last)) width = Math.max(0, last)
          }
        } catch (e) {}
        if (width >= 30) hadPositive = true
        dock.style.width = Math.max(width - 14, 0) + 'px'
        if (width < 30 && hadPositive) {
          const st = face.getSnapshot()
          if (st && st.open) face.setOpenSilently(false)
        }
      }

      const applyState = (st) => {
        dock.style.display = st.open ? 'flex' : 'none'
        expand.style.display = st.open ? 'none' : 'flex'
        if (st.open && st.cwd) {
          pathEl.textContent = st.dir ? st.cwd.replace(/[\\/]+$/, '') + '/' + st.dir : st.cwd
          pathEl.title = pathEl.textContent
        } else {
          pathEl.textContent = ''
        }
        if (layout) {
          try {
            if (st.open) layout.openDetails()
            else layout.closeDetails()
          } catch (e) {}
        }
      }
      applyState(face.getSnapshot())
      measure()
      const off = face.subscribe(() => {
        applyState(face.getSnapshot())
        measure()
      })
      const ro = frame ? new ResizeObserver(measure) : null
      if (ro) ro.observe(frame)
      window.addEventListener('resize', measure)
      const mo = frame ? new MutationObserver(measure) : null
      if (mo) mo.observe(frame, { attributes: true, attributeFilter: ['style'] })

      expand.addEventListener('click', () => face.openPanel())
      collapseBtn.addEventListener('click', () => face.closePanel())

      return () => {
        try {
          off()
        } catch (e) {}
        if (ro) ro.disconnect()
        if (mo) mo.disconnect()
        window.removeEventListener('resize', measure)
        if (host.parentNode) host.parentNode.removeChild(host)
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots', 'layout', 'sessions', 'remote']

    function apply(ctx) {
      const slots = ctx.get ? ctx.get('slots') || ctx.slots : ctx.slots
      const layout = ctx.get ? ctx.get('layout') : undefined
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
              slots.register({ name: 'shell.overlay', inject: () => ({ focus: face, layout: layout }) }, FocusPanel),
            )
            if (typeof disposer === 'function') disposers.push(disposer)
            disposers.push(face.dispose)
            registered = true
          } catch (err) {
            ctx.logger?.warn?.('[dsh-focus] overlay seat unavailable, using fallback panel', err && err.message ? err.message : err)
          }
          if (!registered && typeof document !== 'undefined') {
            disposers.push(mountFallback(face, layout))
            disposers.push(face.dispose)
          }
        } else if (typeof document !== 'undefined') {
          ctx.logger?.warn?.('[dsh-focus] required services missing - panel not mounted')
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
