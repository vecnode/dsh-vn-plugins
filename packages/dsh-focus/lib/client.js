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
 *   - closed   -> ctx.layout.closeDetails() (chat full width) + Focus stays
 *                 visible as a slim edge rail (like the collapsed left
 *                 sidebar) with the expand control - never a close button
 *   - width    -> tracked live from the frame's grid-template-columns, so the
 *                 panel follows the user's drag handle exactly
 *
 * The panel element itself lives in the empty core `shell.overlay` seat
 * (declared by ui-layout), so no core slot takeover is needed. If that seat
 * can not be registered for any reason, a plain-DOM fallback panel that
 * reserves the same track is mounted instead.
 *
 * Content (alpha iteration per owner):
 *   - the current conversation's folder, listed as one row per file/folder
 *     (session + cwd via ctx.sessions; entries via the
 *     `remote.fileReferences` namespace - the same kind-aware, cwd-scoped
 *     remote the `@` file menu uses). Dotfiles are shown by default with a
 *     footer "Hidden files" toggle; breadcrumbs navigate into folders; the
 *     panel never silently blanks: 'waiting' (listing service not mounted
 *     yet, retried), 'loading', and error states are shown explicitly.
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
.dsf-crumbCurrent{color:var(--dsw-alias-label-secondary,#666);padding:0 2px}
.dsf-body{width:100%;display:flex;flex-direction:column}
.dsf-row{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;text-align:left;border:0;background:transparent;border-radius:6px;padding:3px 8px;height:28px;color:var(--dsw-alias-label-primary,#1f1f1f);cursor:pointer;font:inherit;flex:none}
.dsf-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsf-rowIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,#888)}
.dsf-rowDir .dsf-rowIcon{color:#e8a33d}
.dsf-rowName{flex:1;min-width:0;font-size:12.5px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-chev{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px 7px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999)}
.dsf-count{white-space:nowrap}
.dsf-toggle{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px;user-select:none}
.dsf-toggle:hover{color:var(--dsw-alias-label-primary,#333)}
.dsf-toggle input{width:12px;height:12px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-accent,#4f8cff)}
.dsf-rowNameDot{color:var(--dsw-alias-label-secondary,#777)}
.dsf-status{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:6px 4px;text-align:left;display:flex;align-items:center;gap:6px}
.dsf-statusDot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-info-primary,rgba(79,140,255,.8))}
.dsf-statusErrDot{background:var(--dsw-alias-state-error-primary,#d3382c)}
.dsf-statusWarnDot{background:var(--dsw-alias-state-warning-primary,#d29922)}
.dsf-rail{position:absolute;top:0;right:0;bottom:0;width:52px;display:flex;flex-direction:column;align-items:center;padding-top:8px;background:var(--dsw-alias-bg-base,var(--dsw-specific-sidebar-fill,#f7f7f8));border-left:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25))}
.dsf-railBtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0;margin-top:2px}
.dsf-railBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-railLabel{writing-mode:vertical-rl;font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-tertiary,#999);margin-top:8px;text-transform:uppercase}
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

    // Version marker shown in the panel header so a freshly loaded bundle is
    // easy to verify after a restart. Keep in sync with package.json.
    const PLUGIN_VERSION = '0.1.0-alpha.5'
    const PLUGIN_BADGE = PLUGIN_VERSION.indexOf('-alpha.') >= 0 ? 'alpha.' + PLUGIN_VERSION.split('-alpha.')[1] : PLUGIN_VERSION

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

    // Panel-toggle glyph (mirrors the left sidebar's panel icon): a pane with
    // a vertical divider - clearly expand/collapse, never a close mark.
    function IconPanel() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 2, y: 2.75, width: 12, height: 10.5, rx: 1.5 }),
        h('path', { d: 'M10.6 5v6' }),
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
    function createFocusStore(getRefs, sessions) {
      // The `remote.fileReferences` namespace is a cordis service that mounts
      // when the gateway contribution lands, which can be AFTER Focus
      // activates. getRefs() is re-read on every refresh, and the 'waiting'
      // phase retries until the service appears - so a slow namespace shows a
      // status line instead of a silently empty folder.
      let open = true // visible (and reserving the details track) by default
      let showHidden = true // dotfiles included by default (footer toggle turns them off)
      let sessionId = undefined
      let cwd = undefined
      let dir = ''
      let phase = 'idle' // idle | waiting | loading | ready | error
      let error = null
      let entries = []
      let truncated = false
      let aborter = null
      let retryTimer = null
      let disposed = false

      const listeners = new Set()
      let snapshot = { open, phase, sessionId, cwd, dir, entries, showHidden, truncated, error }

      function emit() {
        snapshot = { open, phase, sessionId, cwd, dir, entries, showHidden, truncated, error }
        for (const listener of listeners) {
          try {
            listener()
          } catch (e) {
            // a throwing subscriber must not break the others
          }
        }
      }

      function refsNow() {
        try {
          return getRefs()
        } catch (e) {
          return undefined
        }
      }

      function cancelRetry() {
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
      }

      function scheduleRetry() {
        if (disposed || retryTimer) return
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (!disposed) refresh()
        }, 700)
      }

      // One directory listing: visible entries plus (when enabled) dotfiles.
      // The backend only reveals dotfiles when the query fragment starts with
      // ".", and that mode is fuzzy: it also returns non-hidden names that
      // merely contain a dot. The dotOnly flag keeps exactly the true hidden
      // entries from that batch (then merged + deduped with the plain batch).
      async function listFolder(refs, signal) {
        const base = dir === '' ? '' : dir + '/'
        const jobs = [{ query: base, dotOnly: false }]
        if (showHidden) jobs.push({ query: dir === '' ? './.' : dir + '/.', dotOnly: true })

        let lastErr = null
        const results = await Promise.all(
          jobs.map((job) =>
            refs.list(sessionId, job.query, signal).then((result) => {
              if (signal.aborted) return null
              if (result && result.ok === true) return { entries: result.value || [], dotOnly: job.dotOnly }
              if (result && result.ok === false) lastErr = result.error || 'list failed'
              return null
            }),
          ),
        )
        if (signal.aborted) return { entries: [], error: null }

        const seen = new Set()
        const merged = []
        for (const batch of results) {
          if (!batch) continue
          for (const candidate of batch.entries) {
            if (!candidate || !candidate.path) continue
            const name = candidate.path.split('/').pop()
            if (batch.dotOnly && !name.startsWith('.')) continue
            const path = normRel(candidate.path)
            if (seen.has(path)) continue
            seen.add(path)
            merged.push({
              name,
              path,
              kind: candidate.kind === 'directory' ? 'directory' : 'file',
            })
          }
        }
        merged.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
        return { entries: merged, error: lastErr }
      }

      async function refresh() {
        if (disposed) return
        const refs = refsNow()
        if (!sessionId || !cwd) {
          // No conversation yet: stay quiet, do not retry for the service.
          phase = 'idle'
          entries = []
          truncated = false
          error = null
          cancelRetry()
          emit()
          return
        }
        if (!refs) {
          // Namespace not mounted yet - wait for it instead of pretending the
          // folder is empty.
          phase = 'waiting'
          entries = []
          truncated = false
          error = null
          scheduleRetry()
          emit()
          return
        }
        cancelRetry()
        if (aborter) aborter.abort()
        const controller = new AbortController()
        aborter = controller
        phase = 'loading'
        entries = []
        error = null
        emit()

        const signal = controller.signal
        try {
          const listed = await listFolder(refs, signal)
          if (signal.aborted) return
          entries = listed.entries
          truncated = listed.entries.length >= 1900
          phase = listed.error && listed.entries.length === 0 ? 'error' : 'ready'
          error =
            phase === 'error'
              ? String((listed.error && (listed.error.message || listed.error.code)) || listed.error)
              : null
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
            cancelRetry()
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
            cancelRetry()
            emit()
          }
        },
        setOpenSilently(value) {
          // Layout-driven close (track collapsed by the user/core): mirror it
          // without re-fighting the layout.
          if (open !== value) {
            open = value
            if (!value) cancelRetry()
            emit()
          }
        },
        togglePanel() {
          open = !open
          if (open) refresh()
          else cancelRetry()
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
        setShowHidden(value) {
          const next = !!value
          if (next !== showHidden) {
            showHidden = next
            refresh()
          }
        },
        dispose() {
          disposed = true
          cancelRetry()
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
        const dot = entry.name.charAt(0) === '.'
        rows.push(
          h(
            'button',
            {
              key: entry.path,
              type: 'button',
              className: 'dsf-row' + (isDir ? ' dsf-rowDir' : ''),
              title: isDir ? entry.path + '/' : entry.path,
              onClick: isDir
                ? () => {
                    face.openDir(entry.path)
                  }
                : undefined,
            },
            h('span', { className: 'dsf-rowIcon' }, isDir ? IconFolder() : IconFile()),
            h('span', { className: 'dsf-rowName' + (dot ? ' dsf-rowNameDot' : '') }, entry.name),
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
        // Collapsed: the panel is always visible as a slim rail on the right
        // edge (like the collapsed left sidebar), with the expand control.
        return h(
          'div',
          { className: 'dsf-rail', role: 'complementary', 'aria-label': 'Focus panel (collapsed)' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsf-railBtn',
              title: 'Expand Focus panel',
              'aria-label': 'Expand Focus panel',
              'aria-expanded': 'false',
              'aria-controls': 'dsh-focus-dock',
              onClick: face.openPanel,
            },
            IconPanel(),
          ),
          h('span', { className: 'dsf-railLabel' }, 'Focus'),
        )
      }

      const width = Math.max(trackWidth - 14, 0) // leave room for the drag handle
      const hasFolder = !!(state.sessionId && state.cwd)
      const fullPath = hasFolder ? joinDisplay(state.cwd, state.dir) : ''

      // Breadcrumbs for drilled folders: ancestors are clickable, the current
      // segment is plain text.
      const crumbEls = []
      if (state.dir) {
        const parts = state.dir.split('/')
        crumbEls.push(
          h(
            'button',
            { key: 'root', type: 'button', className: 'dsf-crumbLink', title: 'Workspace root', onClick: () => face.openDir('') },
            'workspace',
          ),
        )
        let acc = ''
        for (let i = 0; i < parts.length; i += 1) {
          acc = acc ? acc + '/' + parts[i] : parts[i]
          crumbEls.push(h('span', { key: acc + '/sep' }, ' / '))
          if (i === parts.length - 1) {
            crumbEls.push(h('span', { key: acc, className: 'dsf-crumbCurrent', 'aria-current': 'location' }, parts[i]))
          } else {
            crumbEls.push(
              h('button', { key: acc, type: 'button', className: 'dsf-crumbLink', onClick: () => face.openDir(acc) }, parts[i]),
            )
          }
        }
      }

      // Body per store phase: waiting (listing service not mounted yet),
      // loading, error, empty, or the real folder rows.
      let body
      if (!hasFolder) {
        body = h('div', { className: 'dsf-empty' }, 'Open a conversation to see its folder here.')
      } else if (state.phase === 'waiting') {
        body = h(
          'div',
          { className: 'dsf-status' },
          h('span', { className: 'dsf-statusDot dsf-statusWarnDot' }),
          h('span', null, 'Starting the folder service\u2026'),
        )
      } else if (state.phase === 'loading') {
        body = h(
          'div',
          { className: 'dsf-status' },
          h('span', { className: 'dsf-statusDot' }),
          h('span', null, 'Loading folder\u2026'),
        )
      } else if (state.phase === 'error') {
        body = h('div', { className: 'dsf-error' }, state.error || 'Could not list this folder.')
      } else if (state.entries.length === 0) {
        body = h(
          'div',
          { className: 'dsf-empty' },
          state.showHidden
            ? 'No files to show here \u2014 excluded folders (node_modules, dist, \u2026) are skipped.'
            : 'No files to show here (hidden files are off).',
        )
      } else {
        body = h(FolderList, { face, state })
      }

      const itemCount = state.entries.length
      const footer = hasFolder
        ? h(
            'div',
            { className: 'dsf-foot' },
            h(
              'span',
              { className: 'dsf-count' },
              state.phase === 'ready' || state.phase === 'error'
                ? itemCount + (state.truncated ? '+' : '') + ' item' + (itemCount === 1 ? '' : 's')
                : '\u00a0',
            ),
            h(
              'label',
              { className: 'dsf-toggle', title: 'Show or hide dotfiles such as .gitignore and .dsh-version.json' },
              h('input', {
                type: 'checkbox',
                checked: state.showHidden,
                onChange: (event) => face.setShowHidden(event.target.checked),
              }),
              h('span', null, 'Hidden files'),
            ),
          )
        : null

      return h(
        'div',
        { className: 'dsf-root', ref: rootRef },
        h(
          'div',
          {
            id: 'dsh-focus-dock',
            className: 'dsf-dock',
            style: width > 0 ? { width: width + 'px' } : { width: '0px', overflow: 'hidden' },
            role: 'complementary',
            'aria-label': 'Focus panel',
            'aria-expanded': 'true',
          },
          h(
            'div',
            { className: 'dsf-head' },
            h('span', { className: 'dsf-title' }, 'Focus'),
            h('span', { className: 'dsf-badge', title: PLUGIN_VERSION }, PLUGIN_BADGE),
            h('span', { className: 'dsf-headSpacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsf-act',
                title: 'Collapse Focus panel to the edge bar',
                'aria-label': 'Collapse Focus panel',
                'aria-expanded': 'true',
                'aria-controls': 'dsh-focus-dock',
                onClick: face.closePanel,
              },
              IconPanel(),
            ),
          ),
          h(
            'div',
            { className: 'dsf-scroll' },
            h('div', { className: 'dsf-sectionTitle' }, 'Conversation folder'),
            hasFolder ? h('div', { className: 'dsf-path', title: fullPath }, fullPath) : null,
            crumbEls.length > 0 ? h('div', { className: 'dsf-crumb' }, crumbEls) : null,
            body,
          ),
          footer,
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
      dock.id = 'dsh-focus-dock'
      dock.style.pointerEvents = 'auto'

      const head = document.createElement('div')
      head.className = 'dsf-head'
      const title = document.createElement('span')
      title.className = 'dsf-title'
      title.textContent = 'Focus'
      const badge = document.createElement('span')
      badge.className = 'dsf-badge'
      badge.title = PLUGIN_VERSION
      badge.textContent = PLUGIN_BADGE
      const spacer = document.createElement('span')
      spacer.className = 'dsf-headSpacer'
      const collapseBtn = document.createElement('button')
      collapseBtn.type = 'button'
      collapseBtn.className = 'dsf-act'
      collapseBtn.title = 'Collapse Focus panel to the edge bar'
      collapseBtn.setAttribute('aria-label', 'Collapse Focus panel')
      collapseBtn.setAttribute('aria-expanded', 'true')
      collapseBtn.textContent = '\u00bb'
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
      const bodyEl = document.createElement('div')
      bodyEl.className = 'dsf-body'
      scroll.appendChild(section)
      scroll.appendChild(pathEl)
      scroll.appendChild(bodyEl)

      const foot = document.createElement('div')
      foot.className = 'dsf-foot'
      const countEl = document.createElement('span')
      countEl.className = 'dsf-count'
      const toggle = document.createElement('label')
      toggle.className = 'dsf-toggle'
      toggle.title = 'Show or hide dotfiles such as .gitignore and .dsh-version.json'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      const toggleText = document.createElement('span')
      toggleText.textContent = 'Hidden files'
      toggle.appendChild(checkbox)
      toggle.appendChild(toggleText)
      foot.appendChild(countEl)
      foot.appendChild(toggle)

      dock.appendChild(head)
      dock.appendChild(scroll)
      dock.appendChild(foot)

      // Slim rail used while collapsed (mirrors the collapsed left sidebar).
      const rail = document.createElement('div')
      rail.className = 'dsf-rail'
      rail.setAttribute('role', 'complementary')
      rail.setAttribute('aria-label', 'Focus panel (collapsed)')
      const expandBtn = document.createElement('button')
      expandBtn.type = 'button'
      expandBtn.className = 'dsf-railBtn'
      expandBtn.title = 'Expand Focus panel'
      expandBtn.setAttribute('aria-label', 'Expand Focus panel')
      expandBtn.setAttribute('aria-expanded', 'false')
      expandBtn.textContent = '\u00ab'
      const railLabel = document.createElement('span')
      railLabel.className = 'dsf-railLabel'
      railLabel.textContent = 'Focus'
      rail.appendChild(expandBtn)
      rail.appendChild(railLabel)

      host.appendChild(dock)
      host.appendChild(rail)
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

      function makeRow(name, opts) {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'dsf-row' + (opts.dir ? ' dsf-rowDir' : '')
        if (opts.title) row.title = opts.title
        const icon = document.createElement('span')
        icon.className = 'dsf-rowIcon'
        icon.textContent = opts.dir ? '\u25b8' : '\u00b7'
        const label = document.createElement('span')
        label.className = 'dsf-rowName' + (opts.dot ? ' dsf-rowNameDot' : '')
        label.textContent = name
        row.appendChild(icon)
        row.appendChild(label)
        if (opts.dir) {
          const chev = document.createElement('span')
          chev.className = 'dsf-chev'
          chev.textContent = '>'
          row.appendChild(chev)
        }
        if (opts.onClick) row.addEventListener('click', opts.onClick)
        return row
      }

      const renderBody = (st) => {
        bodyEl.textContent = ''
        if (!st.sessionId || !st.cwd) {
          const hint = document.createElement('div')
          hint.className = 'dsf-empty'
          hint.textContent = 'Open a conversation to see its folder here.'
          bodyEl.appendChild(hint)
          return
        }
        if (st.phase === 'waiting') {
          const status = document.createElement('div')
          status.className = 'dsf-status'
          status.textContent = 'Starting the folder service\u2026'
          bodyEl.appendChild(status)
          return
        }
        if (st.phase === 'loading') {
          const status = document.createElement('div')
          status.className = 'dsf-status'
          status.textContent = 'Loading folder\u2026'
          bodyEl.appendChild(status)
          return
        }
        if (st.phase === 'error') {
          const err = document.createElement('div')
          err.className = 'dsf-error'
          err.textContent = st.error || 'Could not list this folder.'
          bodyEl.appendChild(err)
          return
        }
        if (st.entries.length === 0) {
          const hint = document.createElement('div')
          hint.className = 'dsf-empty'
          hint.textContent = st.showHidden
            ? 'No files to show here \u2014 excluded folders (node_modules, dist, \u2026) are skipped.'
            : 'No files to show here (hidden files are off).'
          bodyEl.appendChild(hint)
          return
        }
        if (st.dir) {
          bodyEl.appendChild(makeRow('..', { title: 'Go up one folder', onClick: () => face.goUp() }))
        }
        for (const entry of st.entries) {
          const isDir = entry.kind === 'directory'
          bodyEl.appendChild(
            makeRow(entry.name, {
              dir: isDir,
              dot: entry.name.charAt(0) === '.',
              title: isDir ? entry.path + '/' : entry.path,
              onClick: isDir
                ? () => {
                    face.openDir(entry.path)
                  }
                : undefined,
            }),
          )
        }
      }

      const applyState = (st) => {
        const open = !!st.open
        dock.style.display = open ? 'flex' : 'none'
        rail.style.display = open ? 'none' : 'flex'
        collapseBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
        expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
        if (open && st.cwd) {
          pathEl.textContent = st.dir ? st.cwd.replace(/[\\/]+$/, '') + '/' + st.dir : st.cwd
          pathEl.title = pathEl.textContent
          pathEl.style.display = ''
        } else {
          pathEl.textContent = ''
          pathEl.style.display = 'none'
        }
        if (open) {
          renderBody(st)
          countEl.textContent =
            st.phase === 'ready' || st.phase === 'error'
              ? st.entries.length + (st.truncated ? '+' : '') + ' item' + (st.entries.length === 1 ? '' : 's')
              : '\u00a0'
        }
        checkbox.checked = !!st.showHidden
        if (layout) {
          try {
            if (open) layout.openDetails()
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

      expandBtn.addEventListener('click', () => face.openPanel())
      collapseBtn.addEventListener('click', () => face.closePanel())
      checkbox.addEventListener('change', () => face.setShowHidden(checkbox.checked))

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
    const inject = ['slots', 'layout', 'sessions', 'remote', 'remote.fileReferences']

    function apply(ctx) {
      const slots = ctx.get ? ctx.get('slots') || ctx.slots : ctx.slots
      const layout = ctx.get ? ctx.get('layout') : undefined
      const sessions = ctx.get ? ctx.get('sessions') : undefined
      const remote = ctx.get ? ctx.get('remote') : undefined

      // Re-resolve the folder-listing namespace on every call: it is a cordis
      // service that mounts when the gateway contribution lands, possibly
      // AFTER this plugin activates. When it is not there yet the store sits
      // in the 'waiting' phase and retries instead of showing an empty folder.
      const getRefs = () => {
        if (ctx && typeof ctx.get === 'function') {
          try {
            const named = ctx.get('remote.fileReferences')
            if (named && typeof named.list === 'function') return named
          } catch (e) {}
        }
        try {
          const onRemote = remote && remote.fileReferences
          if (onRemote && typeof onRemote.list === 'function') return onRemote
        } catch (e) {}
        return undefined
      }

      const disposers = []
      try {
        if (slots && sessions) {
          const face = createFocusStore(getRefs, sessions)
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
