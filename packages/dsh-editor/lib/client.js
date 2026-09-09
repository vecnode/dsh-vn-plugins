/**
 * dsh-editor - browser half.
 *
 * Renders the "Editor" tab inside the dsh-files right dock (the tab host
 * dsh-files owns) as a second panel beside "Files", triggered by an "Editor"
 * header capsule registered in the same core session-header utilities seat as
 * the "Files" capsule (order 200 -> it sits to the RIGHT of Files).
 *
 * The panel itself is CodeMirror 6, vendored ONCE as a classic IIFE
 * (`window.DSHEditorCM`, built from vendor/entry.js into lib/vendor/cm6.min.js)
 * and fetched lazily over the plugin's own authenticated route on the first
 * open, so an idle GUI never pays for the editor.
 *
 * Data path (alpha.1):
 *   - files: double-clicking a text file row in the Files tree asks the Files
 *     host to open this panel with that file (dispatchOpenFile), carrying the
 *     conversation cwd the Files store is already scoped to;
 *   - open:  GET /api/dsh-editor/file?cwd=...&path=... returns strict-UTF-8
 *     text only - binary / invalid-UTF-8 files are refused server-side, so the
 *     editor can never open a non-text file;
 *   - save:  the toolbar has a search input (find-within-file via CodeMirror)
 *     and a SAVE button (no refresh). Saving PUTs the whole document back to
 *     the same route with the mtime/size the file had when opened; if the file
 *     changed on disk meanwhile the server answers 409 and the panel offers
 *     "Reload" or "Save anyway" instead of silently clobbering.
 *
 * Dirty state: the panel compares the live document to the last saved text;
 * the save button enables only when a file is open AND modified. Ctrl/Cmd+S is
 * bound inside the editor. Unsaved changes are NOT auto-persisted - closing the
 * tab while dirty loses them (documented alpha caveat).
 *
 * Module-table format of every core client package; no build step for this
 * file itself (only the vendored CM6 artifact is generated, from
 * vendor/entry.js - see the package README).
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-editor',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect } = React

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------
    const css = `
.dse-root{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}
.dse-tools{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 8px 14px}
.dse-searchWrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}
.dse-find{flex:1;min-width:0;height:26px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);padding:0 26px 0 8px;font:inherit;font-size:12.5px;outline:none}
.dse-find::placeholder{color:var(--dsw-alias-label-tertiary,#999)}
.dse-find:focus{border-color:var(--dsw-alias-state-accent,#4f8cff)}
.dse-find:disabled{opacity:.5}
.dse-clear{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:none;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;background:var(--dsw-alias-button-floating-fill,rgba(127,127,127,.16));color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;padding:0;font-size:10px;line-height:1}
.dse-clear.on{display:inline-flex}
.dse-actions{flex:none;display:flex;align-items:center;gap:8px;min-width:0}
.dse-saveStatus{flex:none;font-size:11px;line-height:1;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap}
.dse-saveStatus.err{color:var(--dsw-alias-state-error-primary,#d3382c)}
.dse-saveStatus.warn{color:var(--dsw-alias-state-warning-primary,#d29922)}
.dse-save{flex:none;display:inline-flex;align-items:center;gap:6px;height:26px;box-sizing:border-box;border:0;border-radius:6px;background:var(--dsw-alias-state-accent,#4f8cff);color:#fff;font:inherit;font-size:12.5px;font-weight:500;padding:0 12px;cursor:pointer;white-space:nowrap}
.dse-save:hover:not(:disabled){filter:brightness(1.08)}
.dse-save:disabled{opacity:.45;cursor:default}
.dse-fileBar{flex:none;display:flex;align-items:center;gap:8px;padding:4px 10px 5px 14px;border-top:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18));font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999);min-width:0}
.dse-filePath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;color:var(--dsw-alias-label-secondary,#666)}
.dse-dirtyDot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warning-primary,#d29922);opacity:0}
.dse-dirty .dse-dirtyDot{opacity:1}
.dse-dirtyText{flex:none;white-space:nowrap}
.dse-body{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.dse-cm{position:absolute;left:0;right:0;top:0;bottom:0;display:none;overflow:hidden}
.dse-cm.on{display:block}
.dse-cm .cm-editor{height:100%}
.dse-cm .cm-scroller{font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:12.5px;line-height:1.6}
.dse-cm .cm-editor.cm-focused{outline:none}
.dse-state{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;color:var(--dsw-alias-label-tertiary,#999);font-size:12.5px;line-height:18px;text-align:center}
.dse-state.hidden{display:none}
.dse-stateTitle{font-size:13px;color:var(--dsw-alias-label-secondary,#666);font-weight:500}
.dse-stateErr{color:var(--dsw-alias-state-error-primary,#d3382c)}
.dse-banner{margin:6px 10px 6px 14px;flex:none;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.2));border-left:2px solid var(--dsw-alias-state-warning-primary,#d29922);border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));padding:6px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f1f1f);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dse-banner .dse-bannerText{flex:1;min-width:120px}
.dse-banner button{border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);border-radius:5px;font:inherit;font-size:11.5px;padding:2px 8px;cursor:pointer}
.dse-banner button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dse-headerEditor{flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.28));border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:13px;line-height:1;padding:0 14px;cursor:pointer;white-space:nowrap}
.dse-headerEditor:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dse-headerEditor[aria-pressed=true]{border-color:var(--dsw-alias-state-accent,#4f8cff);color:var(--dsw-alias-state-accent,#4f8cff);background:var(--dsw-alias-interactive-bg-hover,rgba(79,140,255,.12))}
.dse-headerEditorIcon{flex:none;display:inline-flex}
`
    const CSS_TAG = 'dsh-editor/editor.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-editor'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // Version marker (keep in sync with package.json).
    const PLUGIN_VERSION = '0.1.0-alpha.1'

    // ---------------------------------------------------------------------
    // Constants / helpers (route paths kept in sync with lib/index.js)
    // ---------------------------------------------------------------------
    const FILE_ROUTE = '/api/dsh-editor/file'
    const VENDOR_ROUTE = '/api/dsh-editor/vendor'
    const h = React.createElement

    function IconEditor() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M5.5 3.5 2 8l3.5 4.5' }),
        h('path', { d: 'M10.5 3.5 14 8l-3.5 4.5' }),
      )
    }

    function fmtTime(d) {
      try {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      } catch (e) {
        return ''
      }
    }

    /** Debounced helper. */
    function debounce(fn, ms) {
      let t = null
      return (...args) => {
        if (t) clearTimeout(t)
        t = setTimeout(() => {
          t = null
          fn(...args)
        }, ms)
      }
    }

    // ---------------------------------------------------------------------
    // Host accessor: the dsh-files dock bridge.
    // dsh-files assigns window.__dshFilesHost once its dock is mounted and
    // fires 'dsh-files:host-ready'. Activation order between the two bundles
    // is not guaranteed, so every access goes through this accessor and the
    // runtime below re-syncs when the host appears late.
    // ---------------------------------------------------------------------
    function hostNow() {
      try {
        const host = window.__dshFilesHost
        return host && typeof host.registerPanel === 'function' ? host : undefined
      } catch (e) {
        return undefined
      }
    }

    /** Tiny store the header capsule subscribes to; mirrors the host snapshot. */
    function createEditorRuntime() {
      const listeners = new Set()
      let lastSnapshot = { open: false, tabs: [], active: null }
      let host = undefined
      let hostSubscribed = false

      function readHost() {
        const next = hostNow()
        if (next !== host) {
          host = next
          hostSubscribed = false
        }
        if (host && !hostSubscribed && typeof host.subscribe === 'function') {
          try {
            host.subscribe(emit)
            hostSubscribed = true
          } catch (e) {}
        }
      }

      function emit() {
        readHost()
        const next = host ? host.getSnapshot() : { open: false, tabs: [], active: null }
        lastSnapshot = next
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (e) {}
        }
      }

      // Host may publish after this bundle activated: listen for the ready
      // event AND poll briefly as a fallback, then stop polling.
      let poll = null
      function armPoll() {
        if (poll) return
        let tries = 0
        poll = setInterval(() => {
          tries += 1
          if (hostNow()) {
            clearInterval(poll)
            poll = null
            emit()
          } else if (tries > 100) {
            clearInterval(poll)
            poll = null
          }
        }, 150)
      }
      const onHostReady = () => emit()
      if (typeof window !== 'undefined') {
        window.addEventListener('dsh-files:host-ready', onHostReady)
        armPoll()
      }
      readHost()

      return {
        subscribe(listener) {
          listeners.add(listener)
          readHost()
          return () => {
            listeners.delete(listener)
          }
        },
        getSnapshot() {
          readHost()
          return host ? host.getSnapshot() : lastSnapshot
        },
        openPanel() {
          const hh = hostNow()
          if (hh) hh.openPanel('editor')
        },
        closePanel() {
          const hh = hostNow()
          if (hh) hh.closePanel('editor')
        },
        togglePanel() {
          const hh = hostNow()
          if (!hh) return
          const st = hh.getSnapshot()
          if (st.open && st.tabs.indexOf('editor') >= 0) hh.closePanel('editor')
          else hh.openPanel('editor')
        },
        dispose() {
          if (typeof window !== 'undefined') window.removeEventListener('dsh-files:host-ready', onHostReady)
          if (poll) {
            clearInterval(poll)
            poll = null
          }
          listeners.clear()
        },
      }
    }

    // ---------------------------------------------------------------------
    // React "Editor" header trigger - same seat as the Files capsule, to its
    // right (order 200 > 100).
    // ---------------------------------------------------------------------
    function EditorHeaderTrigger(props) {
      const runtime = props.editorRuntime
      if (!runtime) return null
      const snapshot = useSyncExternalStoreShim(runtime)
      const open = snapshot.open && snapshot.tabs.indexOf('editor') >= 0
      const icon = h('span', { className: 'dse-headerEditorIcon', 'aria-hidden': true }, IconEditor())
      return h(
        'button',
        {
          type: 'button',
          className: 'dse-headerEditor',
          'aria-pressed': open ? 'true' : 'false',
          title: open ? 'Close the Editor panel' : 'Open the Editor panel',
          onClick: () => runtime.togglePanel(),
        },
        icon,
        h('span', null, 'Editor'),
      )
    }

    // React 18 may not expose useSyncExternalStore through the harness seed
    // the same way; the Files plugin requires it, but a plain subscribe-based
    // shim is dependency-free and identical for our use.
    function useSyncExternalStoreShim(store) {
      const [snapshot, setSnapshot] = useState(() => store.getSnapshot())
      useEffect(() => {
        let active = true
        const update = () => {
          if (active) setSnapshot(store.getSnapshot())
        }
        const off = store.subscribe(update)
        update()
        return () => {
          active = false
          try {
            off()
          } catch (e) {}
        }
      }, [store])
      return snapshot
    }

    // ---------------------------------------------------------------------
    // Vendored CodeMirror 6 engine (lazy, once).
    // ---------------------------------------------------------------------
    let cmEnginePromise = null
    function ensureCmEngine() {
      if (window.DSHEditorCM) return Promise.resolve(window.DSHEditorCM)
      if (!cmEnginePromise) {
        cmEnginePromise = (async () => {
          const res = await fetch(VENDOR_ROUTE, { method: 'GET', credentials: 'same-origin' })
          if (!res.ok) {
            throw new Error('editor engine unavailable (HTTP ' + res.status + ')')
          }
          const source = await res.text()
          if (window.DSHEditorCM) return window.DSHEditorCM
          const blob = new Blob([source], { type: 'text/javascript' })
          const url = URL.createObjectURL(blob)
          await new Promise((resolve, reject) => {
            const el = document.createElement('script')
            el.async = true
            el.src = url
            el.addEventListener('load', () => {
              el.remove()
              URL.revokeObjectURL(url)
              resolve()
            }, { once: true })
            el.addEventListener('error', () => {
              el.remove()
              URL.revokeObjectURL(url)
              reject(new Error('editor engine failed to start'))
            }, { once: true })
            document.head.appendChild(el)
          })
          if (!window.DSHEditorCM) throw new Error('editor engine did not initialize')
          return window.DSHEditorCM
        })()
      }
      return cmEnginePromise
    }

    // ---------------------------------------------------------------------
    // Language mapping (syntax highlighting by file extension).
    // ---------------------------------------------------------------------
    function languageExtensionFor(CM, fileName) {
      const ext = (String(fileName || '').split('.').pop() || '').toLowerCase()
      switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
          return CM.javascript()
        case 'jsx':
          return CM.javascript({ jsx: true })
        case 'ts':
          return CM.javascript({ typescript: true })
        case 'tsx':
          return CM.javascript({ typescript: true, jsx: true })
        case 'json':
        case 'jsonc':
          return CM.json()
        case 'md':
        case 'markdown':
        case 'mdown':
          return CM.markdown()
        case 'py':
        case 'pyw':
          return CM.python()
        case 'html':
        case 'htm':
        case 'xhtml':
          return CM.html()
        case 'css':
          return CM.css()
        case 'yaml':
        case 'yml':
          return CM.yaml()
        default:
          return null
      }
    }

    function isWrapFile(fileName) {
      const ext = (String(fileName || '').split('.').pop() || '').toLowerCase()
      return ['md', 'markdown', 'mdown', 'txt', 'text', 'log', 'csv', 'gitignore', 'editorconfig'].indexOf(ext) >= 0 || ext === ''
    }

    // ---------------------------------------------------------------------
    // The panel body - built and mounted by the dsh-files host into the
    // Editor tab's section. Returns the controller the host calls.
    // ---------------------------------------------------------------------
    function buildEditorPanel(rootEl) {
      const toolRoot = document.createElement('div')
      toolRoot.className = 'dse-root'

      // ---- toolbar: find-in-file search + SAVE (no refresh) ----
      const tools = document.createElement('div')
      tools.className = 'dse-tools'
      const searchWrap = document.createElement('div')
      searchWrap.className = 'dse-searchWrap'
      const findInput = document.createElement('input')
      findInput.type = 'text'
      findInput.className = 'dse-find'
      findInput.placeholder = 'Find in file\u2026'
      findInput.spellcheck = false
      findInput.disabled = true
      const clearFind = document.createElement('button')
      clearFind.type = 'button'
      clearFind.className = 'dse-clear'
      clearFind.title = 'Clear search'
      clearFind.setAttribute('aria-label', 'Clear search')
      clearFind.textContent = '\u00d7'
      searchWrap.appendChild(findInput)
      searchWrap.appendChild(clearFind)
      const actions = document.createElement('div')
      actions.className = 'dse-actions'
      const saveStatus = document.createElement('span')
      saveStatus.className = 'dse-saveStatus'
      saveStatus.textContent = '\u00a0'
      const saveBtn = document.createElement('button')
      saveBtn.type = 'button'
      saveBtn.className = 'dse-save'
      saveBtn.disabled = true
      saveBtn.textContent = 'Save'
      saveBtn.title = 'Save this file to disk (Ctrl+S)'
      actions.appendChild(saveStatus)
      actions.appendChild(saveBtn)
      tools.appendChild(searchWrap)
      tools.appendChild(actions)
      toolRoot.appendChild(tools)

      // ---- file bar: path + dirty dot ----
      const fileBar = document.createElement('div')
      fileBar.className = 'dse-fileBar'
      const dirtyDot = document.createElement('span')
      dirtyDot.className = 'dse-dirtyDot'
      const filePath = document.createElement('span')
      filePath.className = 'dse-filePath'
      const dirtyText = document.createElement('span')
      dirtyText.className = 'dse-dirtyText'
      fileBar.appendChild(dirtyDot)
      fileBar.appendChild(filePath)
      fileBar.appendChild(dirtyText)
      toolRoot.appendChild(fileBar)

      // ---- body: editor / hint / error states ----
      const body = document.createElement('div')
      body.className = 'dse-body'
      const cmWrap = document.createElement('div')
      cmWrap.className = 'dse-cm'
      const stateEl = document.createElement('div')
      stateEl.className = 'dse-state'
      const stateTitle = document.createElement('div')
      stateTitle.className = 'dse-stateTitle'
      const stateHint = document.createElement('div')
      stateEl.appendChild(stateTitle)
      stateEl.appendChild(stateHint)
      body.appendChild(cmWrap)
      body.appendChild(stateEl)
      toolRoot.appendChild(body)

      const bannerHost = document.createElement('div')
      toolRoot.insertBefore(bannerHost, body)

      rootEl.appendChild(toolRoot)

      // ---- editor state ----
      let CM = null
      let cm = null
      let langCompartment = null
      let wrapCompartment = null
      let file = null // { cwd, path, mtimeMs, size }
      let lastSaved = ''
      let dirty = false
      let busy = false
      let saving = false
      let disposed = false
      let engineError = null

      // ---- tiny status helpers ----
      function showState(kind, title, hint) {
        stateEl.classList.toggle('hidden', kind === 'none')
        stateEl.classList.toggle('dse-stateErr', kind === 'error')
        stateTitle.textContent = title || ''
        stateHint.textContent = hint || ''
        cmWrap.classList.toggle('on', kind === 'edit')
      }

      function setStatus(text, mode) {
        saveStatus.textContent = text || '\u00a0'
        saveStatus.className = 'dse-saveStatus' + (mode === 'err' ? ' err' : mode === 'warn' ? ' warn' : '')
      }

      let statusTimer = null
      function flashStatus(text, mode, ms) {
        setStatus(text, mode)
        if (statusTimer) clearTimeout(statusTimer)
        statusTimer = setTimeout(() => {
          statusTimer = null
          setStatus('', '')
        }, ms || 1800)
      }

      function showBanner(html, buttons) {
        bannerHost.textContent = ''
        const banner = document.createElement('div')
        banner.className = 'dse-banner'
        const text = document.createElement('span')
        text.className = 'dse-bannerText'
        text.textContent = html
        banner.appendChild(text)
        for (const b of buttons || []) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.textContent = b.label
          btn.addEventListener('click', () => {
            try {
              b.onClick()
            } catch (e) {}
          })
          banner.appendChild(btn)
        }
        bannerHost.appendChild(banner)
        return banner
      }

      function clearBanner() {
        bannerHost.textContent = ''
      }

      function updateDirtyUi() {
        const has = !!file
        const isDirty = has && dirty
        fileBar.classList.toggle('dse-dirty', isDirty)
        dirtyText.textContent = isDirty ? 'Modified' : ''
        fileBar.title = file ? (file.cwd ? file.cwd.replace(/[\\/]$/, '') + '/' : '') + file.path : ''
        saveBtn.disabled = !has || !isDirty || saving || busy
        findInput.disabled = !has || !cm
        if (has && findInput.disabled) findInput.placeholder = 'Find in file\u2026'
        saveBtn.title = !has ? 'Open a text file first' : isDirty ? 'Save this file to disk (Ctrl+S)' : 'Nothing to save'
      }

      function onDocChanged() {
        if (!cm || !file) return
        const text = cm.state.doc.toString()
        dirty = text !== lastSaved
        updateDirtyUi()
      }

      // Debounced equality check keeps the dirty flag honest after undoing
      // back to the saved text without comparing every keystroke.
      const recheckDirty = debounce(() => {
        if (!cm || !file || disposed) return
        const text = cm.state.doc.toString()
        if (text === lastSaved && dirty) {
          dirty = false
          updateDirtyUi()
        }
      }, 250)

      function saveNow(force) {
        if (!cm || !file || saving || busy) return
        if (!force && !dirty) return
        const target = file
        const text = cm.state.doc.toString()
        saving = true
        setStatus('Saving\u2026')
        updateDirtyUi()
        fetch(FILE_ROUTE, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cwd: target.cwd,
            path: target.path,
            text,
            expected: force ? undefined : { mtimeMs: target.mtimeMs, size: target.size },
          }),
        })
          .then(async (res) => {
            if (disposed) return
            let payload = null
            try {
              payload = await res.json()
            } catch (e) {}
            if (res.status === 409 && payload && payload.error && payload.error.code === 'CHANGED_ON_DISK') {
              saving = false
              setStatus('Changed on disk', 'warn')
              const current = payload.error.current || {}
              showBanner('This file changed on disk since you opened it. Saving would overwrite the newer version.', [
                {
                  label: 'Reload',
                  onClick: () => {
                    clearBanner()
                    openFile({ cwd: target.cwd, path: target.path }, true)
                  },
                },
                {
                  label: 'Save anyway',
                  onClick: () => {
                    clearBanner()
                    saveNow(true)
                  },
                },
              ])
              return
            }
            if (res.status >= 200 && res.status < 300 && payload && payload.ok) {
              lastSaved = text
              dirty = cm.state.doc.toString() !== lastSaved
              file.mtimeMs = typeof payload.mtimeMs === 'number' ? payload.mtimeMs : target.mtimeMs
              file.size = typeof payload.size === 'number' ? payload.size : target.size
              flashStatus(dirty ? 'Saved (more edits)' : 'Saved ' + fmtTime(new Date()))
              clearBanner()
            } else {
              const msg = payload && payload.error ? payload.error.message : 'Save failed (HTTP ' + res.status + ')'
              setStatus('Save failed', 'err')
              showBanner(msg, [])
            }
            saving = false
            updateDirtyUi()
          })
          .catch((err) => {
            if (disposed) return
            saving = false
            setStatus('Save failed', 'err')
            showBanner(err && err.message ? err.message : 'Could not reach the editor service.', [])
            updateDirtyUi()
          })
      }

      function ensureEditor() {
        if (cm) return cm
        langCompartment = new CM.Compartment()
        wrapCompartment = new CM.Compartment()
        const extensions = []
        // Editor basics (a curated basicSetup).
        extensions.push(
          CM.lineNumbers(),
          CM.highlightActiveLineGutter(),
          CM.highlightSpecialChars(),
          CM.history(),
          CM.foldGutter(),
          CM.drawSelection(),
          CM.dropCursor(),
          CM.EditorState.allowMultipleSelections.of(true),
          CM.indentOnInput(),
          CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
          CM.bracketMatching(),
          CM.closeBrackets(),
          CM.autocompletion(),
          CM.rectangularSelection(),
          CM.crosshairCursor(),
          CM.highlightActiveLine(),
          CM.highlightSelectionMatches(),
          CM.search({ top: true }),
          CM.keymap.of([
            ...CM.closeBracketsKeymap,
            ...CM.defaultKeymap,
            ...CM.searchKeymap,
            ...CM.historyKeymap,
            ...CM.completionKeymap,
            { key: 'Mod-s', run: () => { saveNow(false); return true } },
          ]),
          CM.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onDocChanged()
              recheckDirty()
            }
          }),
          langCompartment.of([]),
          wrapCompartment.of([CM.EditorView.lineWrapping]),
        )
        // The editor ALWAYS renders on the dark oneDark palette (owner's
        // choice): the Files dock uses dark design tokens, and oneDark keeps
        // the text + syntax highlight palette readable on that dark grey
        // background no matter what the OS or app scheme reports - so no
        // prefers-color-scheme detection here.
        extensions.push(CM.oneDark)
        const theme = CM.EditorView.theme({
          '&': { height: '100%', fontSize: '12.5px' },
          '&.cm-focused': { outline: 'none' },
          // Gutters are transparent so the line-number strip always shares the
          // exact code background (oneDark paints .cm-editor behind them).
          '.cm-gutters': { backgroundColor: 'transparent' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent' },
          '.cm-scroller': {
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            fontSize: '12.5px',
            lineHeight: '1.6',
            color: 'var(--dsw-alias-label-primary,#d4d4d4)',
          },
        })
        extensions.push(theme)
        cm = new CM.EditorView({
          parent: cmWrap,
          state: CM.EditorState.create({
            doc: '',
            extensions,
          }),
        })
        return cm
      }

      function applyLanguage(fileName) {
        if (!cm || !CM) return
        const lang = languageExtensionFor(CM, fileName)
        const wrapped = isWrapFile(fileName)
        cm.dispatch({
          effects: [
            langCompartment.reconfigure(lang ? [lang] : []),
            wrapCompartment.reconfigure(wrapped ? [CM.EditorView.lineWrapping] : []),
          ],
        })
      }

      function setDocument(text) {
        if (!cm) return
        cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } })
      }

      /** Open (or re-open) a file in the panel. */
      async function openFile(f, discardSilently) {
        if (disposed) return
        if (!f || typeof f.cwd !== 'string' || typeof f.path !== 'string') return
        if (!discardSilently && dirty && cm && file) {
          // eslint-disable-next-line no-alert
          if (!window.confirm('Discard unsaved changes to ' + file.path + '?')) return
        }
        clearBanner()
        engineError = null
        showState('loading', 'Opening\u2026', f.path)
        updateDirtyUi()
        try {
          await ensureCmEngine()
          CM = CM || window.DSHEditorCM
          const res = await fetch(
            FILE_ROUTE + '?cwd=' + encodeURIComponent(f.cwd) + '&path=' + encodeURIComponent(f.path),
            { method: 'GET', credentials: 'same-origin' },
          )
          const payload = await res.json().catch(() => null)
          if (disposed) return
          if (!res.ok || !payload || !payload.ok) {
            const code = payload && payload.error ? payload.error.code : 'HTTP ' + res.status
            const message = payload && payload.error ? payload.error.message : 'Could not open this file.'
            if (code === 'NOT_TEXT') {
              showState('error', 'Not a text file', 'This file is binary or not valid UTF-8, so it cannot open in the text editor.')
              file = null
              lastSaved = ''
              dirty = false
              updateDirtyUi()
              return
            }
            engineError = message
            showState('error', 'Could not open the file', message)
            return
          }
          ensureEditor()
          file = {
            cwd: f.cwd,
            path: payload.path || f.path,
            mtimeMs: typeof payload.mtimeMs === 'number' ? payload.mtimeMs : null,
            size: typeof payload.size === 'number' ? payload.size : null,
          }
          lastSaved = payload.text || ''
          dirty = false
          setDocument(lastSaved)
          applyLanguage(file.path)
          filePath.textContent = (file.cwd ? file.cwd.replace(/[\\/]$/, '') + '/' : '') + file.path
          filePath.title = filePath.textContent
          showState('edit')
          flashStatus('Opened')
          updateDirtyUi()
          try {
            cm.focus()
          } catch (e) {}
        } catch (err) {
          if (disposed) return
          engineError = err && err.message ? err.message : String(err)
          showState('error', 'Editor unavailable', engineError)
        }
      }

      // ---- find-in-file wiring (toolbar search drives CodeMirror search) ----
      const runFind = debounce(() => {
        if (!cm || !CM || !file) return
        const value = findInput.value
        if (!value) {
          try {
            CM.closeSearchPanel(cm)
          } catch (e) {}
          return
        }
        cm.dispatch({ effects: CM.setSearchQuery.of(new CM.SearchQuery({ search: value })) })
        try {
          CM.openSearchPanel(cm)
        } catch (e) {}
      }, 200)
      findInput.addEventListener('input', () => {
        clearFind.classList.toggle('on', !!findInput.value)
        runFind()
      })
      findInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          findInput.value = ''
          clearFind.classList.remove('on')
          runFind()
        }
      })
      clearFind.addEventListener('click', () => {
        findInput.value = ''
        clearFind.classList.remove('on')
        runFind()
        findInput.focus()
      })
      saveBtn.addEventListener('click', () => saveNow(false))

      // Initial empty state.
      showState('empty', 'No file open', 'Double-click a file in the Files panel to open it here. Only text files are supported.')
      updateDirtyUi()

      return {
        openFile: (f) => openFile(f, false),
        dispose() {
          disposed = true
          if (statusTimer) clearTimeout(statusTimer)
          if (cm) {
            try {
              cm.destroy()
            } catch (e) {}
            cm = null
          }
          if (toolRoot.parentNode) toolRoot.parentNode.removeChild(toolRoot)
        },
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots']

    function apply(ctx) {
      const disposers = []
      let registered = false
      let slotInjected = false

      function registerIntoHost() {
        const host = hostNow()
        if (!host || registered) return
        registered = true
        try {
          host.registerPanel({
            id: 'editor',
            title: 'Editor',
            acceptsOpenFile: true,
            mount: (el) => buildEditorPanel(el),
          })
          ctx.logger?.debug?.('[dsh-editor] registered Editor panel into the Files dock')
        } catch (err) {
          ctx.logger?.warn?.('[dsh-editor] panel registration failed', err && err.message ? err.message : err)
        }
      }

      function injectTrigger(runtime) {
        const slots = ctx.get ? ctx.get('slots') : undefined
        if (!slots || typeof slots.inject !== 'function' || slotInjected) return
        slotInjected = true
        try {
          const off = slots.inject('conversation.session.header.utilities', () =>
            slots.register(
              {
                name: 'conversation.session.header.utilities',
                id: 'dsh-editor-open',
                order: 200,
                label: 'Editor',
                inject: () => ({ editorRuntime: runtime }),
              },
              EditorHeaderTrigger,
            ),
          )
          disposers.push(() => {
            try {
              off()
            } catch (e) {}
          })
        } catch (err) {
          ctx.logger?.warn?.('[dsh-editor] header trigger registration failed', err && err.message ? err.message : err)
        }
      }

      if (typeof document !== 'undefined') {
        const runtime = createEditorRuntime()
        disposers.push(() => {
          try {
            runtime.dispose()
          } catch (e) {}
        })
        injectTrigger(runtime)
        registerIntoHost()
        // The dock host (dsh-files) can publish after this bundle activates;
        // register the panel the moment it exists.
        const onReady = () => registerIntoHost()
        window.addEventListener('dsh-files:host-ready', onReady)
        disposers.push(() => {
          try {
            window.removeEventListener('dsh-files:host-ready', onReady)
          } catch (e) {}
        })
      } else {
        ctx.logger?.warn?.('[dsh-editor] no document - browser half not mounted')
      }

      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch (e) {}
        }
      }
    }

    exports.name = 'dsh-editor'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
