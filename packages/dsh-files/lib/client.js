/**
 * dsh-files - browser half.
 *
 * Renders the "Files" panel as a real right-hand column next to the chat,
 * mirroring the left navigation panel. Files reserves its OWN strip inside
 * the core AppFrame instead of borrowing the core "details" grid track:
 *
 *   - the frame gets `padding-right: var(--dsh-files-w)` (box-sizing
 *     border-box), so the sidebar / conversation / core details column are
 *     squeezed left - the chat is never overlapped, and because Files never
 *     calls ctx.layout.openDetails() the core empty "Details" placeholder can
 *     not pop up behind the panel either
 *   - the dock is sized from the same variable, so it always exactly fills
 *     the reserved strip
 *   - the panel header is a Claude-style TAB STRIP: each open panel is a tab
 *     with a close ("x") button on the tab itself. Files is the only panel
 *     registered today, but the host is shaped so more plugins can register
 *     more panels later (they show up as additional tabs). A "Files" trigger
 *     button is mounted into the core session-header utilities seat, next to
 *     the shipped "Session log" capsule.
 *   - collapsed mode is GONE: a panel is either expanded (its strip is
 *     reserved) or fully hidden. Closing the last open tab (its x, or the
 *     header "Files" button again) hides the whole dock and hands the space
 *     back to the chat - there is no slim rail left on the edge.
 *   - width     -> the drag grip at the panel's left edge resizes the strip.
 *     Changes snap (no transitions): the dock display and the width variable
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
 *     footer "Hidden files" toggle; folders expand in place as a tree; the
 *     panel never silently blanks: 'waiting' (listing service not mounted
 *     yet, retried), 'loading', and error states are shown explicitly.
 *   - a Claude-Code-style toolbar sits above the rows: a search input that
 *     filters the currently loaded rows (client-side; whole-workspace fuzzy
 *     search is a follow-up) and a refresh button that re-lists the folder
 *     and any expanded subfolders.
 *
 * Module-table format of every core client package; no build step.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-files',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useSyncExternalStore } = React

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------
    const css = `
.dsf-root{display:contents}
.dsf-dock{position:absolute;top:0;right:0;bottom:0;width:var(--dsh-files-w,0px);box-sizing:border-box;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.dsf-tabbar{flex:none;display:flex;align-items:center;gap:8px;height:32px;box-sizing:border-box;min-width:0;padding:0 8px 0 14px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.2))}
.dsf-tabs{display:flex;align-items:stretch;gap:2px;min-width:0;overflow:hidden;height:100%}
.dsf-tab{flex:none;display:inline-flex;align-items:center;gap:6px;max-width:170px;height:100%;box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0 6px 0 10px;font:inherit;font-size:12.5px;white-space:nowrap}
.dsf-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-tabActive{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#1f1f1f);box-shadow:inset 0 -2px 0 var(--dsw-alias-state-accent,#4f8cff)}
.dsf-tabTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dsf-tabX{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;padding:0;font-size:11px;line-height:1}
.dsf-tabX:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-tabbarRight{flex:1;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}
.dsf-badge{flex:none;font-size:10px;line-height:16px;font-weight:500;border-radius:8px;padding:0 6px;color:var(--dsw-alias-label-tertiary,#8a8a8a);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));white-space:nowrap}
.dsf-tools{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 8px 14px}
.dsf-search{flex:1;min-width:0;height:26px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);padding:0 26px 0 8px;font:inherit;font-size:12.5px;outline:none}
.dsf-search::placeholder{color:var(--dsw-alias-label-tertiary,#999)}
.dsf-search:focus{border-color:var(--dsw-alias-state-accent,#4f8cff)}
.dsf-searchClear{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:none;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;background:var(--dsw-alias-button-floating-fill,rgba(127,127,127,.16));color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;padding:0;font-size:10px;line-height:1}
.dsf-searchWrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}
.dsf-headBtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dsf-headBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsf-scroll{flex:1;min-height:0;overflow-y:auto;padding:8px 10px 10px 14px}
.dsf-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:6px 4px;text-align:left}
.dsf-error{color:var(--dsw-alias-state-error-primary,#d3382c);font-size:12px;line-height:18px;padding:6px 4px;word-break:break-word}
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
.dsf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 10px 7px 14px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999)}
.dsf-count{white-space:nowrap}
.dsf-toggle{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px;user-select:none}
.dsf-toggle:hover{color:var(--dsw-alias-label-primary,#333)}
.dsf-toggle input{width:12px;height:12px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-accent,#4f8cff)}
.dsf-rowNameDot{color:var(--dsw-alias-label-secondary,#777)}
.dsf-status{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;padding:6px 4px;text-align:left;display:flex;align-items:center;gap:6px}
.dsf-statusDot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-info-primary,rgba(79,140,255,.8))}
.dsf-statusErrDot{background:var(--dsw-alias-state-error-primary,#d3382c)}
.dsf-statusWarnDot{background:var(--dsw-alias-state-warning-primary,#d29922)}
/* The "Files" trigger capsule rendered next to the core "Session log" button
   in the session header utilities seat. Mirrors the core capsule geometry so
   it reads as part of the header. */
.dsf-headerFiles{flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.28));border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:13px;line-height:1;padding:0 14px;cursor:pointer;white-space:nowrap}
.dsf-headerFiles:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsf-headerFiles[aria-pressed=true]{border-color:var(--dsw-alias-state-accent,#4f8cff);color:var(--dsw-alias-state-accent,#4f8cff);background:var(--dsw-alias-interactive-bg-hover,rgba(79,140,255,.12))}
.dsf-headerFilesIcon{flex:none;display:inline-flex}
/* Files reserves its own right strip inside the core AppFrame: the frame's
   padding-right and the dock's width share one CSS variable, so the strip the
   chat concedes always equals the panel that fills it. Changes snap - no
   transitions - because every state flips the dock display together with the
   variable, so the chat is never overlapped and no intermediate strip can
   show the core behind the panel. When no tab is open the reserved width is 0
   and the dock is display:none (no collapsed rail - the header trigger
   reopens the panel). The body prefix keeps this ahead of the core frame rule
   without beating the core's own [data-dragging] transition kill. */
body [data-dsh-files-pad]{box-sizing:border-box;padding-right:var(--dsh-files-w,0px)}
`
    const CSS_TAG = 'dsh-files/files.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-files'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // Version marker shown in the panel header so a freshly loaded bundle is
    // easy to verify after a restart. Keep in sync with package.json.
    const PLUGIN_VERSION = '0.1.0-alpha.11'
    const PLUGIN_BADGE = PLUGIN_VERSION.indexOf('-alpha.') >= 0 ? 'alpha.' + PLUGIN_VERSION.split('-alpha.')[1] : PLUGIN_VERSION

    // ---------------------------------------------------------------------
    // Icons / helpers
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

    function normRel(path) {
      return String(path || '').replace(/^\.\//, '')
    }

    // DOM-built inline SVG (the DOM dock cannot reuse the React icon helpers,
    // which produce React elements rather than DOM nodes).
    function domIconRefresh() {
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('viewBox', '0 0 16 16')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '1.5')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.setAttribute('aria-hidden', 'true')
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V6H10')
      svg.appendChild(path)
      return svg
    }

    // ---------------------------------------------------------------------
    // Tab host store: which panels are open (their order) and which is
    // active. Files is the only registered panel today; the host is the
    // template future plugins register into. Both the DOM dock and the React
    // header trigger read/write this one store.
    // ---------------------------------------------------------------------
    function createTabHost() {
      let open = false // false until a panel is opened (button-driven dock)
      let tabs = [] // ordered list of open panel ids
      let active = null // active panel id
      let snapshot = { open, tabs, active }

      const listeners = new Set()
      function emit() {
        snapshot = { open, tabs, active }
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (e) {}
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getSnapshot() {
          return snapshot
        },
        isOpenPanel(id) {
          return open && tabs.indexOf(id) >= 0
        },
        openPanel(id) {
          if (tabs.indexOf(id) < 0) tabs = tabs.concat(id)
          if (!open) open = true
          active = id
          emit()
        },
        closePanel(id) {
          const idx = tabs.indexOf(id)
          if (idx < 0) return
          tabs = tabs.slice(0, idx).concat(tabs.slice(idx + 1))
          if (active === id) active = tabs.length ? tabs[tabs.length - 1] : null
          if (tabs.length === 0) open = false // last tab closed: dock disappears
          emit()
        },
        activatePanel(id) {
          if (open && tabs.indexOf(id) >= 0 && active !== id) {
            active = id
            emit()
          }
        },
        togglePanel(id) {
          if (this.isOpenPanel(id)) this.closePanel(id)
          else this.openPanel(id)
        },
        // Restore persisted tab layout at boot.
        seed(ids, activeId) {
          tabs = ids.slice()
          open = tabs.length > 0
          active = tabs.indexOf(activeId) >= 0 ? activeId : tabs.length ? tabs[tabs.length - 1] : null
          emit()
        },
      }
    }

    // ---------------------------------------------------------------------
    // Files store: one instance per plugin activation.
    // ---------------------------------------------------------------------
    function createFilesStore(getRefs, sessions) {
      // The `remote.fileReferences` namespace is a cordis service that mounts
      // when the gateway contribution lands, which can be AFTER Files
      // activates. getRefs() is re-read on every refresh, and the 'waiting'
      // phase retries until the service appears - so a slow namespace shows a
      // status line instead of a silently empty folder.
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
      let snapshot = { sessionId, cwd, dir, phase, entries, showHidden, truncated, error }

      function emit() {
        snapshot = { sessionId, cwd, dir, phase, entries, showHidden, truncated, error }
        for (const listener of [...listeners]) {
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
          refresh()
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
    // Panel registry (the "template for UI panels"): each entry describes one
    // tab that can be opened in the dock. Files is the only entry today; a
    // future plugin adds a second descriptor here (plus its own header
    // trigger) and the tab strip renders it the same way.
    // ---------------------------------------------------------------------
    const FILES_ID = 'files'
    const PANELS = {
      files: { title: 'Files', glyph: IconFolder },
    }
    function panelTitle(id) {
      const panel = PANELS[id]
      return panel ? panel.title : id
    }

    // ---------------------------------------------------------------------
    // React "Files" header trigger. Registered into the core
    // conversation.session.header.utilities seat (right beside the shipped
    // "Session log" download capsule) through the slots service; reads the
    // shared tab host so its pressed state follows the dock.
    // ---------------------------------------------------------------------
    function FilesHeaderTrigger(props) {
      const tabHost = props.filesTabHost
      if (!tabHost) return null // seat rendered without our inject: render nothing
      const snapshot = useSyncExternalStore(tabHost.subscribe, tabHost.getSnapshot)
      const open = snapshot.open && snapshot.tabs.indexOf(FILES_ID) >= 0
      const icon = h('span', { className: 'dsf-headerFilesIcon', 'aria-hidden': true }, IconFolder())
      return h(
        'button',
        {
          type: 'button',
          className: 'dsf-headerFiles',
          'aria-pressed': open ? 'true' : 'false',
          title: open ? 'Close the Files panel' : 'Open the Files panel',
          onClick: () => {
            if (open) tabHost.closePanel(FILES_ID)
            else tabHost.openPanel(FILES_ID)
          },
        },
        icon,
        h('span', null, 'Files'),
      )
    }

    // ---------------------------------------------------------------------
    // DOM renderer - the only active path.
    // ---------------------------------------------------------------------
    function mountDock(files, tabHost) {
      // Duplicate-activation guard: one host in the DOM means another live
      // mount already rendered its dock. Stacking a second pair would show
      // two docks on the right edge once open.
      if (typeof document !== 'undefined' && document.getElementById('dsh-files-host')) {
        return () => {}
      }
      // Files v8: reserve its own right strip inside the core AppFrame instead
      // of taking over the core "details" grid track. The frame gets
      // `padding-right: var(--dsh-files-w)` (see the [data-dsh-files-pad] CSS
      // rules), so the sidebar / conversation / core details column are
      // squeezed left and the chat is never covered. The dock is sized from
      // the same variable, so it always exactly fills the reserved strip.
      // Because Files never calls ctx.layout.openDetails(), the core empty
      // "Details" placeholder can never pop up behind the panel. There is no
      // collapsed rail: with no open tab the reserved width is 0 and the dock
      // is display:none, so the chat takes back the whole line and no ghost
      // bar can remain; the header "Files" trigger reopens the panel.
      //
      // The core AppFrame can commit the [data-shell-overlay] layer AFTER this
      // plugin activates, so start on the document body and re-parent into the
      // layer when it shows up (see attachToLayer() further down).
      const FIXED_CSS = 'position:fixed;top:0;right:0;bottom:0;z-index:9999;pointer-events:none'
      const LAYER_CSS = 'position:absolute;top:0;right:0;bottom:0;pointer-events:none'
      const host = document.createElement('div')
      host.id = 'dsh-files-host'
      host.style.cssText = FIXED_CSS
      let layerEl = null
      let frame = null
      let ro = null
      let docMo = null
      let hardTimer = null

      // ---- persisted panel state (open tabs / width / hidden toggle) ----
      const STORAGE_KEY = 'dsh-files.v1'
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

      // The dock can go up to about twice the core "details" contract width
      // (1040px) when the window allows, never past the chat minimum.
      function clampPanelWidth(w) {
        const min = 300
        const max = Math.max(min, Math.min(1040, availableForPanel()))
        return Math.max(min, Math.min(max, Math.round(w)))
      }

      // Single writer for the reserved width: it flows to both the frame's
      // padding and the dock's width through one CSS variable, so the two can
      // never disagree and no per-frame grid measurement is needed. Exactly
      // one element is visible at a time: the dock when a tab is open, nothing
      // when the last tab closes (no rail state). Changes snap: dock display
      // and the variable flip in the same frame.
      function applyVisible() {
        const st = tabHost.getSnapshot()
        const showing = st.open && st.tabs.length > 0 && availableForPanel() >= 300
        const w = showing ? clampPanelWidth(prefWidth) : 0
        curReserved = w
        if (frame && frame !== document.body) frame.style.setProperty('--dsh-files-w', w + 'px')
        dock.style.display = showing ? 'flex' : 'none'
        dock.setAttribute('aria-hidden', showing ? 'false' : 'true')
      }

      function persistState() {
        try {
          const st = tabHost.getSnapshot()
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              tabs: st.tabs,
              width: Math.round(curReserved >= 300 ? curReserved : prefWidth),
              hidden: files.getSnapshot().showHidden,
            }),
          )
        } catch (e) {}
      }

      const dock = document.createElement('div')
      dock.className = 'dsf-dock'
      dock.id = 'dsh-files-dock'
      dock.style.pointerEvents = 'auto'
      dock.setAttribute('role', 'complementary')
      dock.setAttribute('aria-label', 'Files panel')

      // ---- Claude-style tab strip ----
      const tabbar = document.createElement('div')
      tabbar.className = 'dsf-tabbar'
      const tabsEl = document.createElement('div')
      tabsEl.className = 'dsf-tabs'
      tabsEl.setAttribute('role', 'tablist')
      const tabbarRight = document.createElement('div')
      tabbarRight.className = 'dsf-tabbarRight'
      const badge = document.createElement('span')
      badge.className = 'dsf-badge'
      badge.title = PLUGIN_VERSION
      badge.textContent = PLUGIN_BADGE
      tabbarRight.appendChild(badge)
      tabbar.appendChild(tabsEl)
      tabbar.appendChild(tabbarRight)

      function renderTabs() {
        tabsEl.textContent = ''
        const st = tabHost.getSnapshot()
        for (const id of st.tabs) {
          const title = panelTitle(id)
          const tab = document.createElement('div')
          tab.className = 'dsf-tab' + (id === st.active ? ' dsf-tabActive' : '')
          tab.setAttribute('role', 'tab')
          tab.setAttribute('aria-selected', id === st.active ? 'true' : 'false')
          const tabTitle = document.createElement('span')
          tabTitle.className = 'dsf-tabTitle'
          tabTitle.textContent = title
          const x = document.createElement('button')
          x.type = 'button'
          x.className = 'dsf-tabX'
          x.title = 'Close ' + title
          x.setAttribute('aria-label', 'Close ' + title)
          x.textContent = '\u00d7'
          x.addEventListener('click', (ev) => {
            ev.stopPropagation()
            tabHost.closePanel(id)
          })
          tab.appendChild(tabTitle)
          tab.appendChild(x)
          tab.addEventListener('click', () => tabHost.activatePanel(id))
          tabsEl.appendChild(tab)
        }
      }

      // ---- Claude-Code-style toolbar: search + refresh ----
      const tools = document.createElement('div')
      tools.className = 'dsf-tools'
      const searchWrap = document.createElement('div')
      searchWrap.className = 'dsf-searchWrap'
      const searchInput = document.createElement('input')
      searchInput.type = 'text'
      searchInput.className = 'dsf-search'
      searchInput.placeholder = 'Search files\u2026'
      searchInput.spellcheck = false
      const clearSearch = document.createElement('button')
      clearSearch.type = 'button'
      clearSearch.className = 'dsf-searchClear'
      clearSearch.title = 'Clear search'
      clearSearch.setAttribute('aria-label', 'Clear search')
      clearSearch.textContent = '\u00d7'
      const refreshBtn = document.createElement('button')
      refreshBtn.type = 'button'
      refreshBtn.className = 'dsf-headBtn'
      refreshBtn.title = 'Refresh the folder listing'
      refreshBtn.setAttribute('aria-label', 'Refresh the folder listing')
      refreshBtn.appendChild(domIconRefresh())
      searchWrap.appendChild(searchInput)
      searchWrap.appendChild(clearSearch)
      tools.appendChild(searchWrap)
      tools.appendChild(refreshBtn)

      const scroll = document.createElement('div')
      scroll.className = 'dsf-scroll'
      const bodyEl = document.createElement('div')
      bodyEl.className = 'dsf-body'
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

      dock.appendChild(tabbar)
      dock.appendChild(tools)
      dock.appendChild(scroll)
      dock.appendChild(foot)

      host.appendChild(dock)
      document.body.appendChild(host)

      // Divider grip: dragging it resizes the reserved strip. The grip sits at
      // the panel's left edge and its line is the ONLY divider (the dock has
      // no border of its own), so the edge reads as one clean drag handle.
      const grip = document.createElement('div')
      grip.className = 'dsf-grip'
      grip.title = 'Drag to resize the Files panel'
      dock.appendChild(grip)

      // Restore persisted tab layout (folder expansions and scroll are
      // intentionally not kept).
      if (Array.isArray(savedState.tabs) && savedState.tabs.length > 0) {
        tabHost.seed(savedState.tabs, savedState.tabs[0])
      }
      if (savedState && typeof savedState.hidden === 'boolean' && savedState.hidden !== files.getSnapshot().showHidden) {
        files.setShowHidden(savedState.hidden)
      }
      renderTabs()

      // -------------------------------------------------------------------
      // Inline tree: folder rows expand in place (same panel, indented), they
      // never navigate the panel into another view. Files have no glyph.
      // -------------------------------------------------------------------
      const expanded = new Set() // folder paths with their children shown
      const kids = new Map() // path -> { status, entries?, error? }
      const kidAborts = new Map() // path -> AbortController
      let lastCtxKey = ''
      let hiddenSeen = files.getSnapshot().showHidden
      let filterText = ''
      let lastVisibleRows = 0

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
        files.loadPath(path, ac.signal).then(
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

      // A row matches when its name or relative path contains the needle
      // (case-insensitive) - a filter over the rows already loaded; folders
      // that match stay visible so their children can be drilled into.
      function matchesFilter(entry) {
        if (!filterText) return true
        const needle = filterText.toLowerCase()
        return entry.name.toLowerCase().indexOf(needle) >= 0 || entry.path.toLowerCase().indexOf(needle) >= 0
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
        let visible = 0
        for (const entry of entries) {
          const isDir = entry.kind === 'directory'
          const isOpen = isDir && expanded.has(entry.path)
          if (!matchesFilter(entry) && !(isDir && isOpen)) {
            // A non-matching folder row is still shown when expanded, because
            // it may contain matching children (their rows filter below it).
            continue
          }
          hostEl.appendChild(buildRow(entry, depth, st))
          visible += 1
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
            visible += renderDir(childHost, info.entries, depth + 1, st)
          }
          hostEl.appendChild(childHost)
        }
        return visible
      }

      const rerender = () => {
        applyState(files.getSnapshot())
      }

      function renderBody(st) {
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
        const visible = renderDir(wrap, st.entries, 0, st)
        lastVisibleRows = visible
        if (visible === 0) {
          const hint = document.createElement('div')
          hint.className = 'dsf-empty'
          hint.textContent = filterText
            ? 'No files match \u201c' + filterText + '\u201d here.'
            : st.showHidden
              ? 'No files to show here \u2014 excluded folders (node_modules, dist, \u2026) are skipped.'
              : 'No files to show here (hidden files are off).'
          wrap.appendChild(hint)
        }
        bodyEl.appendChild(wrap)
      }

      const applyState = (st) => {
        const open = tabHost.getSnapshot().open && tabHost.getSnapshot().tabs.length > 0
        if (open) {
          lastVisibleRows = 0
          renderBody(st)
          if (st.phase === 'ready' || st.phase === 'error') {
            if (filterText) {
              countEl.textContent = lastVisibleRows + ' match' + (lastVisibleRows === 1 ? '' : 'es')
            } else {
              countEl.textContent = st.entries.length + (st.truncated ? '+' : '') + ' item' + (st.entries.length === 1 ? '' : 's')
            }
          } else {
            countEl.textContent = '\u00a0'
          }
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
            frame.setAttribute('data-dsh-files-pad', '')
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

      applyState(files.getSnapshot())
      applyVisible()
      let wasOpen = tabHost.getSnapshot().open && tabHost.getSnapshot().tabs.length > 0
      const offFiles = files.subscribe(() => {
        applyState(files.getSnapshot())
        applyVisible()
        persistState()
      })
      const offTabs = tabHost.subscribe(() => {
        renderTabs()
        const st = tabHost.getSnapshot()
        const nowOpen = st.open && st.tabs.length > 0
        // Re-list when the panel transitions closed -> open so a freshly
        // opened dock shows the current folder (not a stale listing).
        if (nowOpen && !wasOpen) files.refresh()
        wasOpen = nowOpen
        applyState(files.getSnapshot())
        applyVisible()
        persistState()
      })
      const onResize = () => {
        applyVisible()
        persistState()
      }
      window.addEventListener('resize', onResize)

      // ---- toolbar interactions ----
      function runFilter() {
        const raw = searchInput.value.trim()
        filterText = raw
        clearSearch.style.display = raw ? 'inline-flex' : 'none'
        rerender()
      }
      searchInput.addEventListener('input', runFilter)
      searchInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          searchInput.value = ''
          runFilter()
        }
      })
      clearSearch.addEventListener('click', () => {
        searchInput.value = ''
        runFilter()
        searchInput.focus()
      })
      refreshBtn.addEventListener('click', () => {
        files.refresh()
        // Re-load every expanded folder too (existing kids are dropped by the
        // context-key logic only on session change; force them here).
        for (const p of [...expanded]) {
          const ac = kidAborts.get(p)
          if (ac) {
            try {
              ac.abort()
            } catch (e) {}
            kidAborts.delete(p)
          }
          kids.delete(p)
          startKidLoad(p)
        }
        rerender()
      })
      checkbox.addEventListener('change', () => files.setShowHidden(checkbox.checked))

      // ---- drag-to-resize the reserved strip (the panel's left edge) ----
      // Sizes go straight to the CSS variable (no store round-trip per move),
      // so the edge tracks the pointer exactly.
      grip.addEventListener('pointerdown', (ev) => {
        const st = tabHost.getSnapshot()
        if (!st.open || st.tabs.length === 0) return
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
          if (frame && frame !== document.body) frame.style.setProperty('--dsh-files-w', prefWidth + 'px')
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
            const st = tabHost.getSnapshot()
            if (st.open && st.tabs.length > 0) {
              const w = Math.max(240, Math.min(clampPanelWidth(prefWidth), Math.round((window.innerWidth || 1280) * 0.3)))
              dock.style.width = w + 'px'
            }
          }
        }, 4000)
      }

      return () => {
        dragging = false
        try {
          offFiles()
        } catch (e) {}
        try {
          offTabs()
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
          frame.removeAttribute('data-dsh-files-pad')
          frame.style.removeProperty('--dsh-files-w')
        }
        if (host.parentNode) host.parentNode.removeChild(host)
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots', 'sessions', 'remote', 'remote.fileReferences']

    function apply(ctx) {
      const slots = ctx.get ? ctx.get('slots') : undefined
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
        // reserves its own right strip inside the frame (see mountDock), so
        // Files always shows and never touches the core details column. The
        // header "Files" trigger is a REAL React seat entry in the
        // conversation session header utilities (the same seat that carries
        // the shipped "Session log" capsule) - that seat is core-owned and
        // proven, unlike the shell.overlay panel seat.
        if (sessions && typeof document !== 'undefined') {
          const tabHost = createTabHost()
          const filesStore = createFilesStore(getRefs, sessions)
          disposers.push(filesStore.dispose)
          disposers.push(mountDock(filesStore, tabHost))

          if (slots && typeof slots.inject === 'function') {
            try {
              // Render the "Files" trigger beside the core "Session log"
              // capsule. Ascending `order` puts our entry to its right.
              const off = slots.inject('conversation.session.header.utilities', () =>
                slots.register(
                  {
                    name: 'conversation.session.header.utilities',
                    id: 'dsh-files-open',
                    order: 100,
                    label: 'Files',
                    inject: () => ({ filesTabHost: tabHost }),
                  },
                  FilesHeaderTrigger,
                ),
              )
              disposers.push(() => {
                try {
                  off()
                } catch (e) {}
              })
            } catch (err) {
              ctx.logger?.warn?.('[dsh-files] header trigger registration failed', err && err.message ? err.message : err)
            }
          }
        } else if (typeof document !== 'undefined') {
          ctx.logger?.warn?.('[dsh-files] sessions service missing - panel not mounted')
          // eslint-disable-next-line no-console
          console.error('[dsh-files] sessions service missing - panel not mounted')
        }
      } catch (err) {
        ctx.logger?.warn?.('[dsh-files] activation failed', err && err.message ? err.message : err)
        // eslint-disable-next-line no-console
        console.error('[dsh-files] activation failed', err)
      }

      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (e) {}
        }
      }
    }

    exports.name = 'dsh-files'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
