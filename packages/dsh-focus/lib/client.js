/**
 * dsh-focus - browser half.
 *
 * Renders the "Focus" panel as a real right-hand column next to the chat,
 * mirroring the left navigation panel. Focus reserves its OWN strip inside
 * the core AppFrame instead of borrowing the core "details" grid track:
 *
 *   - the frame gets `padding-right: var(--dsh-focus-w)` (box-sizing
 *     border-box), so the sidebar / conversation / core details column are
 *     squeezed left - the chat is never overlapped, and because Focus never
 *     calls ctx.layout.openDetails() the core empty "Details" placeholder can
 *     not pop up behind the panel either
 *   - the dock is sized from the same variable, so it always exactly fills
 *     the reserved strip
 *   - collapsed -> the strip shrinks to a fixed 56px (RAIL_W) and Focus shows
 *     ONLY its slim edge rail inside that strip (like the collapsed left
 *     sidebar) with the expand control - never a close button. The rail sits
 *     next to the chat, never on top of it, and the dock is display:none, so
 *     no second ghost bar can remain
 *   - width     -> the drag grip at the panel's left edge resizes the strip.
 *     Changes snap (no transitions): dock/rail display and the width variable
 *     flip together, so chat is never overlapped mid-change
 *
 * The panel element itself lives in the empty core `shell.overlay` layer
 * (declared by ui-layout) and is re-parented into it when the core AppFrame
 * commits that layer; until then it starts on the document body.
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
.dsf-dock{position:absolute;top:0;right:0;bottom:0;width:var(--dsh-focus-w,0px);box-sizing:border-box;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);overflow:hidden;padding-left:14px}
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
.dsf-rowName{flex:1;min-width:0;font-size:12.5px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsf-chev{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#aaa)}
.dsf-caretSlot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;font-size:9px;color:var(--dsw-alias-label-tertiary,#999)}
.dsf-rowDir .dsf-caretSlot{color:var(--dsw-alias-label-secondary,#777)}
.dsf-caret{display:inline-block;transition:transform .12s ease;transform:rotate(0deg);user-select:none;line-height:1}
.dsf-rowOpen .dsf-caret{transform:rotate(90deg)}
.dsf-grip{position:absolute;top:0;bottom:0;left:0;width:12px;cursor:col-resize;z-index:5;touch-action:none;background:transparent}
.dsf-grip::after{content:'';position:absolute;top:0;bottom:0;left:0;width:1px;background:var(--dsw-alias-border-l3,rgba(127,127,127,.35))}
.dsf-grip:hover::after,.dsf-grip.dsf-dragging::after{background:var(--dsw-alias-state-accent,#4f8cff);width:2px;left:0}
.dsf-kids{display:flex;flex-direction:column}
.dsf-kidsStatus{padding:3px 4px 3px 22px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;display:flex;align-items:center;gap:6px}
.dsf-kidsErr{color:var(--dsw-alias-state-error-primary,#d3382c);padding:3px 4px 3px 22px;font-size:12px;line-height:18px;word-break:break-word}
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
.dsf-rail{position:absolute;top:0;right:0;bottom:0;width:56px;display:flex;flex-direction:column;align-items:center;padding-top:8px;background:var(--dsw-alias-bg-base,var(--dsw-specific-sidebar-fill,#f7f7f8));border-left:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25))}
.dsf-railBtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0;margin-top:2px}
.dsf-railBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-railLabel{writing-mode:vertical-rl;font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-tertiary,#999);margin-top:8px;text-transform:uppercase}
.dsf-expand{position:absolute;top:50%;right:8px;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:30px;height:56px;border:0;border-radius:10px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-button-floating-fill,rgba(127,127,127,.1));box-shadow:0 0 0 .5px var(--dsw-alias-border-l3,rgba(127,127,127,.22));padding:0;z-index:1}
.dsf-expand:hover{color:var(--dsw-alias-label-primary,#1f1f1f);background:var(--dsw-alias-button-floating-hover,rgba(127,127,127,.18))}
/* Focus reserves its own right strip inside the core AppFrame: the frame's
   padding-right and the dock's width share one CSS variable, so the strip the
   chat concedes always equals the panel that fills it. Changes snap - no
   transitions - because every state flips the dock/rail display together with
   the variable, so the chat is never overlapped and no intermediate strip can
   show the core behind the panel. The collapsed state reserves a fixed 56px
   (RAIL_W) and shows only the slim rail inside it, next to the chat, never on
   top of it. The body prefix keeps this ahead of the core frame rule without
   beating the core's own [data-dragging] transition kill. */
body [data-dsh-focus-pad]{box-sizing:border-box;padding-right:var(--dsh-focus-w,0px)}
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
    const PLUGIN_VERSION = '0.1.0-alpha.9'
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
      async function listFolder(path, refs, signal) {
        const p = normRel(path)
        const base = p === '' ? '' : p + '/'
        const jobs = [{ query: base, dotOnly: false }]
        if (showHidden) jobs.push({ query: p === '' ? './.' : p + '/.', dotOnly: true })

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
          const listed = await listFolder(dir, refs, signal)
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
        loadPath(path, signal) {
          // Public listing for a single folder path - used by the inline tree
          // children loader. Same engine as refresh(), but scoped to an
          // arbitrary path and without touching this store's own state.
          if (disposed) return Promise.resolve(null)
          if (!sessionId || !cwd) return Promise.resolve(null)
          const refs = refsNow()
          if (!refs) return Promise.resolve(null)
          return listFolder(normRel(path), refs, signal)
        },
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
    // (Historical / dead code - reference only) The React seat renderer from
    // before alpha.7, when the plugin registered into the shell.overlay slot.
    // Since alpha.7 the DOM renderer in mountFallback() below is the only
    // active path, and Focus reserves its own strip instead of the core
    // details track.
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
    // DOM renderer - the only active path (the React seat above is kept only
    // as reference).
    // ---------------------------------------------------------------------
    function mountFallback(face, layout) {
      // Duplicate-activation guard: one host in the DOM means another live
      // mount already rendered its dock/rail. Stacking a second pair would
      // show two bars on the right edge once collapsed.
      if (typeof document !== 'undefined' && document.getElementById('dsh-focus-host')) {
        return () => {}
      }
      // Focus v6: reserve its own right strip inside the core AppFrame instead
      // of taking over the core "details" grid track. The frame gets
      // `padding-right: var(--dsh-focus-w)` (see the [data-dsh-focus-pad] CSS
      // rules), so the sidebar / conversation / core details column are
      // squeezed left and the chat is never covered. The dock is sized from
      // the same variable, so it always exactly fills the reserved strip.
      // Because Focus no longer calls ctx.layout.openDetails(), the core empty
      // "Details" placeholder can never pop up behind the panel. The collapsed
      // state keeps a fixed 56px strip (RAIL_W) with only the slim rail in it,
      // so the rail sits BESIDE the chat - never on top of it - and no second
      // (dock) bar can remain on screen.
      //
      // The core AppFrame can commit the [data-shell-overlay] layer AFTER this
      // plugin activates, so start on the document body and re-parent into the
      // layer when it shows up (see attachToLayer() further down).
      const FIXED_CSS = 'position:fixed;top:0;right:0;bottom:0;z-index:9999;pointer-events:none'
      const LAYER_CSS = 'position:absolute;top:0;right:0;bottom:0;pointer-events:none'
      const host = document.createElement('div')
      host.id = 'dsh-focus-host'
      host.style.cssText = FIXED_CSS
      let layerEl = null
      let frame = null
      let ro = null
      let docMo = null
      let hardTimer = null

      // ---- persisted panel state (open / width / hidden toggle) ----
      const STORAGE_KEY = 'dsh-focus.v1'
      const savedState = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
        } catch (e) {
          return {}
        }
      })()
      let prefWidth = savedState && typeof savedState.width === 'number' && savedState.width >= 200 ? savedState.width : 360
      let curReserved = 0
      let dragging = false

      // ---- reserved-strip geometry --------------------------------------
      // The collapsed edge rail keeps a fixed strip reserved (mirroring the
      // core's collapsed left rail), so it sits BESIDE the chat instead of
      // floating over it. Keep in sync with the .dsf-rail CSS width.
      const RAIL_W = 56
      // The conversation keeps its usual 640px minimum (the same center
      // minimum the core layout concedes), so a strip width or a drag that
      // would crush the chat is never applied.
      function frameBoxWidth() {
        return (frame && frame !== document.body ? frame.clientWidth : 0) || window.innerWidth || 1280
      }

      function sidebarWidthPx() {
        if (!frame || frame === document.body) return 280
        try {
          const cols = String(frame.style.gridTemplateColumns || window.getComputedStyle(frame).gridTemplateColumns)
            .split(/\s+/)
            .filter(Boolean)
          if (cols.length >= 3) {
            const side = parseFloat(cols[0])
            if (!isNaN(side) && side > 0) return side
          }
        } catch (e) {}
        return 280
      }

      function availableForPanel() {
        return Math.max(0, frameBoxWidth() - sidebarWidthPx() - 640)
      }

      // Inside the core details contract range; never past the chat minimum.
      function clampPanelWidth(w) {
        const min = 300
        const max = Math.max(min, Math.min(520, availableForPanel()))
        return Math.max(min, Math.min(max, Math.round(w)))
      }

      // Single writer for the reserved width: it flows to both the frame's
      // padding and the dock's width through one CSS variable, so the two can
      // never disagree and no per-frame grid measurement is needed. Exactly
      // one element is visible at a time - the dock when expanded, the slim
      // rail when collapsed - never both, so no ghost bar can remain. Changes
      // snap: dock/rail display and the variable flip in the same frame.
      function applyVisible() {
        const st = face.getSnapshot()
        const open = !!st.open
        const fits = availableForPanel() >= 300
        const showing = open && fits
        const w = showing ? clampPanelWidth(prefWidth) : RAIL_W
        curReserved = w
        if (frame && frame !== document.body) frame.style.setProperty('--dsh-focus-w', w + 'px')
        dock.style.display = showing ? 'flex' : 'none'
        rail.style.display = showing ? 'none' : 'flex'
      }

      function persistState() {
        try {
          const st = face.getSnapshot()
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              open: !!st.open,
              hidden: !!st.showHidden,
              width: Math.round(curReserved >= 300 ? curReserved : prefWidth),
            }),
          )
        } catch (e) {}
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
      // The overlay host is pointer-events:none, so the rail and its expand
      // button must opt back in or they can never be clicked.
      const rail = document.createElement('div')
      rail.className = 'dsf-rail'
      rail.style.pointerEvents = 'auto'
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
      document.body.appendChild(host)

      // Divider grip: dragging it resizes the reserved strip. The grip sits at
      // the panel's left edge and its line is the ONLY divider (the dock has
      // no border of its own), so the edge reads as one clean drag handle.
      const grip = document.createElement('div')
      grip.className = 'dsf-grip'
      grip.title = 'Drag to resize the Focus panel'
      dock.appendChild(grip)

      // Restore the collapsed/open state and the hidden-file toggle across
      // restarts (folder expansions and scroll are intentionally not kept).
      if (savedState && savedState.open === false) {
        face.setOpenSilently(false)
      }
      if (savedState && typeof savedState.hidden === 'boolean' && savedState.hidden !== face.getSnapshot().showHidden) {
        face.setShowHidden(savedState.hidden)
      }

      // -------------------------------------------------------------------
      // Inline tree: folder rows expand in place (same panel, indented), they
      // never navigate the panel into another view. Files have no glyph.
      // -------------------------------------------------------------------
      const expanded = new Set() // folder paths with their children shown
      const kids = new Map() // path -> { status, entries?, error? }
      const kidAborts = new Map() // path -> AbortController
      let lastCtxKey = ''
      let hiddenSeen = face.getSnapshot().showHidden

      function clearKids(clearExpanded) {
        for (const ac of kidAborts.values()) {
          try {
            ac.abort()
          } catch (e) {}
        }
        kidAborts.clear()
        kids.clear()
        if (clearExpanded) expanded.clear()
      }

      function startKidLoad(path) {
        const info = kids.get(path)
        if (info && (info.status === 'loading' || info.status === 'ready')) return
        kids.set(path, { status: 'loading' })
        const ac = new AbortController()
        kidAborts.set(path, ac)
        face.loadPath(path, ac.signal).then(
          (res) => {
            kidAborts.delete(path)
            if (ac.signal.aborted) return
            if (!res) {
              kids.set(path, { status: 'waiting' })
              if (expanded.has(path)) {
                setTimeout(() => {
                  if (expanded.has(path)) startKidLoad(path)
                }, 700)
              }
            } else if (res.error && (!res.entries || res.entries.length === 0)) {
              kids.set(path, { status: 'error', error: String((res.error && (res.error.message || res.error.code)) || res.error) })
            } else {
              kids.set(path, { status: 'ready', entries: res.entries || [] })
            }
            if (expanded.has(path)) rerender()
          },
          () => {
            kidAborts.delete(path)
            if (!ac.signal.aborted) {
              kids.set(path, { status: 'error', error: 'Could not list this folder.' })
              if (expanded.has(path)) rerender()
            }
          },
        )
      }

      function toggleDir(path) {
        if (expanded.has(path)) {
          expanded.delete(path)
          const ac = kidAborts.get(path)
          if (ac) {
            try {
              ac.abort()
            } catch (e) {}
            kidAborts.delete(path)
          }
          rerender()
          return
        }
        expanded.add(path)
        if (!kids.get(path) || kids.get(path).status !== 'ready') startKidLoad(path)
        rerender()
      }

      function buildRow(entry, depth, st) {
        const isDir = entry.kind === 'directory'
        const isOpen = isDir && expanded.has(entry.path)
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'dsf-row' + (isDir ? ' dsf-rowDir' : '') + (isOpen ? ' dsf-rowOpen' : '')
        row.title = entry.path + (isDir ? '/' : '')
        row.style.paddingLeft = 6 + depth * 16 + 'px'
        const slot = document.createElement('span')
        slot.className = 'dsf-caretSlot'
        if (isDir) {
          const caret = document.createElement('span')
          caret.className = 'dsf-caret'
          caret.textContent = '\u276f'
          slot.appendChild(caret)
        }
        const label = document.createElement('span')
        label.className = 'dsf-rowName' + (entry.name.charAt(0) === '.' ? ' dsf-rowNameDot' : '')
        label.textContent = entry.name
        row.appendChild(slot)
        row.appendChild(label)
        if (isDir) {
          row.addEventListener('click', () => toggleDir(entry.path))
        }
        return row
      }

      function kidStatusEl(text, depth, isErr) {
        const s = document.createElement('div')
        s.className = isErr ? 'dsf-kidsErr' : 'dsf-kidsStatus'
        s.style.paddingLeft = 22 + depth * 16 + 'px'
        s.textContent = text
        return s
      }

      function renderDir(hostEl, entries, depth, st) {
        for (const entry of entries) {
          const isDir = entry.kind === 'directory'
          const isOpen = isDir && expanded.has(entry.path)
          hostEl.appendChild(buildRow(entry, depth, st))
          if (!isDir || !isOpen) continue
          const info = kids.get(entry.path)
          const childHost = document.createElement('div')
          childHost.className = 'dsf-kids'
          if (!info || info.status === 'loading') {
            if (!info) startKidLoad(entry.path)
            childHost.appendChild(kidStatusEl('Loading\u2026', depth + 1, false))
          } else if (info.status === 'waiting') {
            childHost.appendChild(kidStatusEl('Starting the folder service\u2026', depth + 1, false))
          } else if (info.status === 'error') {
            childHost.appendChild(kidStatusEl(info.error || 'Could not list this folder.', depth + 1, true))
          } else {
            renderDir(childHost, info.entries, depth + 1, st)
          }
          hostEl.appendChild(childHost)
        }
      }

      const rerender = () => {
        applyState(face.getSnapshot())
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
        const ctxKey = st.sessionId + '|' + (st.cwd || '')
        if (ctxKey !== lastCtxKey) {
          lastCtxKey = ctxKey
          clearKids(true) // a different conversation/folder: start a fresh tree
        } else if (st.showHidden !== hiddenSeen) {
          hiddenSeen = st.showHidden
          clearKids(false) // keep the expanded folders, refetch their contents
          for (const p of expanded) startKidLoad(p)
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
        const wrap = document.createElement('div')
        wrap.className = 'dsf-body'
        if (st.entries.length === 0) {
          const hint = document.createElement('div')
          hint.className = 'dsf-empty'
          hint.textContent = st.showHidden
            ? 'No files to show here \u2014 excluded folders (node_modules, dist, \u2026) are skipped.'
            : 'No files to show here (hidden files are off).'
          wrap.appendChild(hint)
        } else {
          renderDir(wrap, st.entries, 0, st)
        }
        bodyEl.appendChild(wrap)
      }

      const applyState = (st) => {
        const open = !!st.open
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
      }
      function attachToLayer() {
        const layer = document.querySelector('[data-shell-overlay]')
        if (!layer) return false
        if (!layerEl) {
          layerEl = layer
          host.style.cssText = LAYER_CSS
          layer.appendChild(host) // moves the host inside the overlay layer
          frame = layer.parentElement || document.body
          if (frame && frame !== document.body) {
            // Tag the frame so the reserved-strip CSS applies to it, then size
            // it now. The ResizeObserver re-clamps when the window changes.
            frame.setAttribute('data-dsh-focus-pad', '')
            if (ro) ro.disconnect()
            ro = new ResizeObserver(applyVisible)
            ro.observe(frame)
          }
          if (docMo) {
            docMo.disconnect()
            docMo = null
          }
          if (hardTimer) {
            clearTimeout(hardTimer)
            hardTimer = null
          }
          applyVisible()
        }
        return true
      }

      applyState(face.getSnapshot())
      applyVisible()
      const off = face.subscribe(() => {
        applyState(face.getSnapshot())
        applyVisible()
        persistState()
      })
      const onResize = () => {
        applyVisible()
        persistState()
      }
      window.addEventListener('resize', onResize)

      expandBtn.addEventListener('click', () => {
        face.openPanel()
        // openPanel() is a no-op when the panel is already open but had to
        // drop to the rail for lack of space - re-apply so a re-expand works
        // the moment there is room again.
        applyVisible()
        persistState()
      })
      collapseBtn.addEventListener('click', () => {
        face.closePanel()
        // Collapsing Focus also closes the core details column if the user
        // had opened it, so the edge rail never covers the core panel.
        if (layout) {
          try {
            layout.closeDetails()
          } catch (e) {}
        }
        applyVisible()
        persistState()
      })
      checkbox.addEventListener('change', () => face.setShowHidden(checkbox.checked))

      // ---- drag-to-resize the reserved strip (the panel's left edge) ----
      // Sizes go straight to the CSS variable (no store round-trip per move),
      // so the edge tracks the pointer exactly.
      grip.addEventListener('pointerdown', (ev) => {
        const st = face.getSnapshot()
        if (!st || !st.open) return
        ev.preventDefault()
        dragging = true
        grip.classList.add('dsf-dragging')
        const startX = ev.clientX
        const startWidth = curReserved >= 300 ? curReserved : clampPanelWidth(prefWidth)
        try {
          grip.setPointerCapture(ev.pointerId)
        } catch (e) {}
        const onMove = (me) => {
          if (!dragging) return
          prefWidth = clampPanelWidth(startWidth + (startX - me.clientX))
          curReserved = prefWidth
          if (frame && frame !== document.body) frame.style.setProperty('--dsh-focus-w', prefWidth + 'px')
        }
        const onUp = () => {
          dragging = false
          grip.classList.remove('dsf-dragging')
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          persistState()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
      })

      if (!attachToLayer()) {
        // The core AppFrame (which owns the [data-shell-overlay] layer) can
        // commit AFTER this plugin activates. Watch the document and re-parent
        // the host into the layer the moment it exists.
        docMo = new MutationObserver(() => {
          attachToLayer()
        })
        docMo.observe(document.documentElement, { childList: true, subtree: true })
        // Last resort: no overlay layer at all - float the panel, sized to
        // the window, instead of reserving a strip.
        hardTimer = setTimeout(() => {
          if (!layerEl) {
            const w = Math.max(240, Math.min(clampPanelWidth(prefWidth), Math.round((window.innerWidth || 1280) * 0.3)))
            dock.style.width = w + 'px'
            rail.style.display = 'none'
          }
        }, 4000)
      }

      return () => {
        dragging = false
        try {
          off()
        } catch (e) {}
        if (ro) ro.disconnect()
        if (docMo) docMo.disconnect()
        if (hardTimer) clearTimeout(hardTimer)
        for (const ac of kidAborts.values()) {
          try {
            ac.abort()
          } catch (e) {}
        }
        window.removeEventListener('resize', onResize)
        // Release the reserved strip so the layout returns to core's own.
        if (frame && frame !== document.body) {
          frame.removeAttribute('data-dsh-focus-pad')
          frame.style.removeProperty('--dsh-focus-w')
        }
        if (host.parentNode) host.parentNode.removeChild(host)
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['layout', 'sessions', 'remote', 'remote.fileReferences']

    function apply(ctx) {
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
        // The DOM panel is the only renderer since alpha.7: the React
        // shell.overlay seat registration is not reliable on rc.1 (it can
        // throw or no-op depending on activation/mount order). The DOM panel
        // re-parents itself into the shell.overlay layer when it exists and
        // reserves its own right strip inside the frame (see mountFallback),
        // so Focus always shows and never touches the core details column.
        if (sessions && typeof document !== 'undefined') {
          const face = createFocusStore(getRefs, sessions)
          disposers.push(face.dispose)
          disposers.push(mountFallback(face, layout))
        } else if (typeof document !== 'undefined') {
          ctx.logger?.warn?.('[dsh-focus] sessions service missing - panel not mounted')
          // eslint-disable-next-line no-console
          console.error('[dsh-focus] sessions service missing - panel not mounted')
        }
      } catch (err) {
        ctx.logger?.warn?.('[dsh-focus] activation failed', err && err.message ? err.message : err)
        // eslint-disable-next-line no-console
        console.error('[dsh-focus] activation failed', err)
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
