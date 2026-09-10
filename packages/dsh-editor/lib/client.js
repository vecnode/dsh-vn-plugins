/**
 * dsh-editor - browser half.
 *
 * A tab TYPE for the GUI's native right Sidebar - the column the conversation
 * header's expand button opens (`@deepseek-ai/dsh-client-ui-sidebar-right`),
 * beside the shipped "Start" (guide) and "Files" tabs:
 *
 *   - the type registers through `ctx.sidebarRightTabs.register(...)` with the
 *     id `dsh-editor` and the kind `editor`; its body and its chip title
 *     register under that same id in the keyed seats
 *     `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title`, exactly like
 *     the tab types the product ships;
 *   - it declares `dsh-resource://file/**` in the `extension` band - the band
 *     reserved for types from outside the product, which outranks every viewer
 *     shipped with it - and vetoes in `canOpen` anything the shipped previews
 *     own (Markdown, HTML, images, PDF, office/archive/media files) and any
 *     path outside the session workspace. Opening a plain text/code file in the
 *     Sidebar (a click in the Files tree, a file link in the conversation)
 *     therefore lands HERE, as an editable tab; everything else keeps its own
 *     preview tab;
 *   - it contributes a guide entry, so the tab strip's "+" control - which
 *     opens the "Start" page - offers "Editor". Picking it creates an editor
 *     tab whose body is a workspace file picker; choosing a file there opens it
 *     in that same tab (`replaceTab`).
 *
 * Data path (alpha.2):
 *   - read:  GET /api/dsh-editor/file?session=<id>&path=<rel> returns strict
 *     UTF-8 text only - binary / invalid-UTF-8 files are refused server-side,
 *     so the editor can never open a non-text file;
 *   - save:  PUT /api/dsh-editor/file with the mtime/size the file had when it
 *     was opened; a file that changed on disk meanwhile answers 409 and the
 *     panel offers "Reload" / "Save anyway" instead of clobbering it;
 *   - the tab's address already carries the authorizing session
 *     (`dsh-resource://file/session/<sessionId>/<path>`), so the client echoes
 *     only the session id and the workspace-relative path and the Node half
 *     resolves the workspace root itself (see lib/index.js).
 *
 * CodeMirror 6 is vendored ONCE as a classic IIFE (`window.DSHEditorCM`, built
 * from vendor/entry.js into lib/vendor/cm6.min.js) and fetched lazily over the
 * plugin's own authenticated route on the first file open, so an idle GUI never
 * pays for the editor.
 *
 * Dirty state: the tab body compares the live document to the last saved text;
 * the SAVE button and the chip's dirty dot follow it. Ctrl/Cmd+S is bound inside
 * the editor. Unsaved changes are NOT auto-persisted - closing the tab while
 * dirty loses them (documented alpha caveat).
 *
 * Module-table format of every core client package; no build step.
 */
/* global window, document */
window.__ModuleLoader__.load({
  id: 'dsh-editor',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    /** This implementation's identity in the tab system, and its slot key. */
    const EDITOR_ID = 'dsh-editor'
    /** The tab kind this package owns. */
    const EDITOR_KIND = 'editor'
    /** The address a page tab of this kind is recorded under (the registry composes this). */
    const PAGE_ADDRESS = 'sidebar://' + EDITOR_KIND
    /** Keep in sync with lib/index.js. */
    const FILE_ROUTE = '/api/dsh-editor/file'
    const VENDOR_ROUTE = '/api/dsh-editor/vendor'
    /** Address grammar owned by @deepseek-ai/dsh-util-workspace-path. */
    const FILE_PREFIX = 'dsh-resource://file/'
    const SESSION_SEGMENT = 'session/'
    /** Version marker shown on the toolbar so a freshly loaded bundle is easy to verify. */
    const PLUGIN_VERSION = '0.1.0-alpha.2'

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------
    const css = `
.dse-root{height:100%;min-height:0;flex:auto;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;color:var(--dsw-alias-label-primary,#1f1f1f);font-size:13px;line-height:1.5}
.dse-tools{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18))}
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
.dse-fileBar{flex:none;display:flex;align-items:center;gap:8px;padding:4px 10px 5px 12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.14));font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999);min-width:0}
.dse-filePath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;color:var(--dsw-alias-label-secondary,#666)}
.dse-dirtyDot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warning-primary,#d29922);opacity:0}
.dse-dirty .dse-dirtyDot{opacity:1}
.dse-dirtyText{flex:none;white-space:nowrap}
.dse-ver{flex:none;white-space:nowrap;opacity:.7}
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
.dse-banner{margin:6px 10px;flex:none;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.2));border-left:2px solid var(--dsw-alias-state-warning-primary,#d29922);border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));padding:6px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#1f1f1f);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dse-banner .dse-bannerText{flex:1;min-width:120px}
.dse-banner button{border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);border-radius:5px;font:inherit;font-size:11.5px;padding:2px 8px;cursor:pointer}
.dse-banner button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
/* The chip's dirty marker (the title seat draws it before the tab's title). */
.dse-titleDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warning-primary,#d29922);margin-right:5px;vertical-align:middle}
/* The empty editor tab: a workspace file picker that opens the chosen file in
   this very tab (the tab record is replaced instead of a second tab opening). */
.dse-pick{height:100%;min-height:0;flex:auto;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}
.dse-pickHead{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 6px 12px;min-width:0}
.dse-pickPath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999)}
.dse-pickBtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}
.dse-pickBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dse-pickScroll{flex:1;min-height:0;overflow-y:auto;padding:0 6px 10px 6px}
.dse-pickRow{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;border:0;background:transparent;border-radius:8px;padding:5px 8px;color:inherit;font:inherit;font-size:12.5px;text-align:left;cursor:pointer;min-width:0}
.dse-pickRow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dse-pickRow[aria-disabled=true]{opacity:.5;cursor:default}
.dse-pickRow[aria-disabled=true]:hover{background:transparent}
.dse-pickIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,#999)}
.dse-pickName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dse-pickNote{padding:6px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#999)}
.dse-pickErr{color:var(--dsw-alias-state-error-primary,#d3382c)}
`
    const CSS_TAG = 'dsh-editor/editor.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-editor'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // ---------------------------------------------------------------------
    // Address helpers (the same grammar @deepseek-ai/dsh-util-workspace-path
    // owns: `dsh-resource://file/session/<sessionId>/<path-segments>`, one
    // component-encoded segment per path segment, `:` kept literal).
    // ---------------------------------------------------------------------
    function decodeSegment(segment) {
      try {
        return decodeURIComponent(segment)
      } catch (e) {
        return segment
      }
    }

    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }

    /**
     * Split a `dsh-resource://file/...` address.
     * @param address - the address a tab was opened at.
     * @returns `{ scope: 'session', sessionId, path }` for a session-scoped
     *   address, `{ scope: 'absolute', path }` for the authorizing-less form,
     *   or `undefined` for anything that is not a file address.
     */
    function parseFileAddress(address) {
      if (typeof address !== 'string' || address.slice(0, FILE_PREFIX.length) !== FILE_PREFIX) return undefined
      const rest = address.slice(FILE_PREFIX.length)
      if (rest.slice(0, SESSION_SEGMENT.length) !== SESSION_SEGMENT) {
        return { scope: 'absolute', path: rest.split('/').map(decodeSegment).join('/') }
      }
      const tail = rest.slice(SESSION_SEGMENT.length)
      const cut = tail.indexOf('/')
      if (cut < 0) return { scope: 'session', sessionId: decodeSegment(tail), path: '' }
      return {
        scope: 'session',
        sessionId: decodeSegment(tail.slice(0, cut)),
        path: tail.slice(cut + 1).split('/').map(decodeSegment).join('/'),
      }
    }

    /** The decoded last path segment of a file address, or the address itself. */
    function basenameOf(address) {
      const file = parseFileAddress(address)
      const path = file ? file.path : String(address || '')
      const name = path.slice(path.lastIndexOf('/') + 1)
      return name === '' ? path || 'Editor' : name
    }

    /** Build a session-scoped file address for a workspace-relative path. */
    function sessionFileAddress(sessionId, path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      return FILE_PREFIX + SESSION_SEGMENT + encodeSegment(sessionId) + '/' + normalized.split('/').map(encodeSegment).join('/')
    }

    /** Whether a path is absolute in either spelling the Host accepts. */
    function isAbsolutePath(value) {
      return value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[/\\]/.test(value)
    }

    /** The address for a path as a caller holds it: relative inside the workspace, absolute outside it. */
    function fileAddressFor(sessionId, cwd, path) {
      const normalized = String(path).replace(/\\/g, '/')
      if (!isAbsolutePath(normalized)) return sessionFileAddress(sessionId, normalized)
      const root = cwd === undefined || cwd === null ? '' : String(cwd).replace(/\\/g, '/').replace(/\/+$/, '')
      if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '')
      if (root !== '' && normalized.indexOf(root + '/') === 0) return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
      return sessionFileAddress(sessionId, normalized)
    }

    /** The lower-cased extension of a path (`''` for none and for dotfiles). */
    function extensionOf(path) {
      const name = String(path).slice(String(path).lastIndexOf('/') + 1)
      const dot = name.lastIndexOf('.')
      return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
    }

    // Extensions the product's own preview types own (Markdown/HTML renderers,
    // the image and PDF viewers) plus the binary formats a text editor cannot
    // show at all. A file with one of these keeps its shipped preview tab: our
    // type registers in the `extension` band, which outranks every builtin, so
    // this veto is what preserves them.
    const PREVIEW_EXTENSIONS = new Set([
      // rendered documents
      'md', 'markdown', 'mdown', 'mkd', 'mdx', 'html', 'htm', 'xhtml',
      // images
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tif', 'tiff',
      // documents / archives / media / binaries
      'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar',
      'mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'mp4', 'webm', 'mov', 'avi', 'mkv',
      'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'jar', 'wasm', 'node',
      'woff', 'woff2', 'ttf', 'otf', 'eot', 'db', 'sqlite', 'icns',
    ])

    /**
     * Whether this type opens a file address: a session-scoped address whose
     * path stays inside the session workspace and is not owned by a shipped
     * preview. The Node half confines reads and writes to that workspace, so
     * anything else is left to the preview it already has.
     */
    function canOpenFile(address) {
      const file = parseFileAddress(address)
      if (!file || file.scope !== 'session') return false
      if (!file.path || isAbsolutePath(file.path.replace(/\\/g, '/'))) return false
      return !PREVIEW_EXTENSIONS.has(extensionOf(file.path))
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------
    /** The guide capsule's glyph (drawn before "Editor" on the Start page). */
    function EditorGlyph(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          className: props ? props.className : undefined,
        },
        h('path', { d: 'M5.5 3.5 2 8l3.5 4.5' }),
        h('path', { d: 'M10.5 3.5 14 8l-3.5 4.5' }),
      )
    }

    function GlyphFolder() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'currentColor', 'aria-hidden': true },
        h('path', {
          d: 'M1.5 3.5A1.5 1.5 0 0 1 3 2h3.1c.4 0 .78.16 1.06.44l.94.94H13a1.5 1.5 0 0 1 1.5 1.5v6.6a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-7.5Z',
        }),
      )
    }

    function GlyphFile() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, 'aria-hidden': true },
        h('path', { d: 'M4 1.8h5l3 3v9.4H4z' }),
        h('path', { d: 'M9 1.8v3h3' }),
      )
    }

    function GlyphUp() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M8 3.5v9' }),
        h('path', { d: 'M4 7.5 8 3.5l4 4' }),
      )
    }

    function GlyphRefresh() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V6H10' }),
      )
    }

    // ---------------------------------------------------------------------
    // Per-tab state the chip title reads: whether the open document is dirty.
    // A body writes it, the title subscribes to it - the tab record itself
    // carries no place for a body-owned flag.
    // ---------------------------------------------------------------------
    const IDLE_TAB_STATE = { dirty: false }
    const tabStates = new Map()
    const titleListeners = new Set()

    function tabStateOf(tabId) {
      const held = tabStates.get(tabId)
      return held === undefined ? IDLE_TAB_STATE : held
    }

    function notifyTitles() {
      for (const listener of [...titleListeners]) {
        try {
          listener()
        } catch (e) {
          /* a throwing subscriber must not break the others */
        }
      }
    }

    function setTabDirty(tabId, dirty) {
      const previous = tabStateOf(tabId)
      if (previous.dirty === dirty) return
      tabStates.set(tabId, { dirty: dirty })
      notifyTitles()
    }

    function dropTabState(tabId) {
      if (tabStates.delete(tabId)) notifyTitles()
    }

    function subscribeTabState(listener) {
      titleListeners.add(listener)
      return () => {
        titleListeners.delete(listener)
      }
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
            el.addEventListener(
              'load',
              () => {
                el.remove()
                URL.revokeObjectURL(url)
                resolve()
              },
              { once: true },
            )
            el.addEventListener(
              'error',
              () => {
                el.remove()
                URL.revokeObjectURL(url)
                reject(new Error('editor engine failed to start'))
              },
              { once: true },
            )
            document.head.appendChild(el)
          })
          if (!window.DSHEditorCM) throw new Error('editor engine did not initialize')
          return window.DSHEditorCM
        })()
      }
      return cmEnginePromise
    }

    // ---------------------------------------------------------------------
    // Language mapping (syntax highlighting by file extension) - the vendored
    // bundle carries javascript/typescript, json, markdown, python, html, css
    // and yaml.
    // ---------------------------------------------------------------------
    function languageExtensionFor(CM, fileName) {
      const ext = extensionOf(fileName)
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
      const ext = extensionOf(fileName)
      return ['md', 'markdown', 'mdown', 'txt', 'text', 'log', 'csv', 'gitignore', 'editorconfig'].indexOf(ext) >= 0 || ext === ''
    }

    /** Debounced helper. */
    function debounce(fn, ms) {
      let timer = null
      return (...args) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          fn(...args)
        }, ms)
      }
    }

    function fmtTime(date) {
      try {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      } catch (e) {
        return ''
      }
    }

    // ---------------------------------------------------------------------
    // One open file: the imperative CodeMirror surface behind a tab record.
    // Built by the body, disposed with the tab.
    // ---------------------------------------------------------------------
    function createEditorInstance(rootEl, tabId) {
      const toolRoot = document.createElement('div')
      toolRoot.className = 'dse-root'

      // ---- toolbar: find-in-file + SAVE (the tab strip owns close/reload) ----
      const tools = document.createElement('div')
      tools.className = 'dse-tools'
      const searchWrap = document.createElement('div')
      searchWrap.className = 'dse-searchWrap'
      const findInput = document.createElement('input')
      findInput.type = 'text'
      findInput.className = 'dse-find'
      findInput.placeholder = 'Find in file\u2026'
      findInput.spellcheck = false
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

      // ---- file bar: dirty dot + workspace-relative path ----
      const fileBar = document.createElement('div')
      fileBar.className = 'dse-fileBar'
      const dirtyDot = document.createElement('span')
      dirtyDot.className = 'dse-dirtyDot'
      const filePath = document.createElement('span')
      filePath.className = 'dse-filePath'
      const dirtyText = document.createElement('span')
      dirtyText.className = 'dse-dirtyText'
      const versionText = document.createElement('span')
      versionText.className = 'dse-ver'
      versionText.textContent = PLUGIN_VERSION
      versionText.title = 'dsh-editor ' + PLUGIN_VERSION
      fileBar.appendChild(dirtyDot)
      fileBar.appendChild(filePath)
      fileBar.appendChild(dirtyText)
      fileBar.appendChild(versionText)
      toolRoot.appendChild(fileBar)

      // ---- body: editor / loading / error states ----
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

      // ---- state ----
      let CM = null
      let cm = null
      let langCompartment = null
      let wrapCompartment = null
      let file = null // { sessionId, path }
      let targetKey = null // sessionId + path of the loaded/loading file
      let lastSaved = ''
      let dirty = false
      let saving = false
      let disposed = false

      function markDirty(next) {
        if (dirty === next) return
        dirty = next
        setTabDirty(tabId, next)
      }

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

      function showBanner(message, buttons) {
        bannerHost.textContent = ''
        const banner = document.createElement('div')
        banner.className = 'dse-banner'
        const text = document.createElement('span')
        text.className = 'dse-bannerText'
        text.textContent = message
        banner.appendChild(text)
        for (const button of buttons || []) {
          const el = document.createElement('button')
          el.type = 'button'
          el.textContent = button.label
          el.addEventListener('click', () => {
            try {
              button.onClick()
            } catch (e) {}
          })
          banner.appendChild(el)
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
        fileBar.title = file ? file.path : ''
        saveBtn.disabled = !has || !isDirty || saving
        findInput.disabled = !has || !cm
        saveBtn.title = !has ? 'Open a text file first' : isDirty ? 'Save this file to disk (Ctrl+S)' : 'Nothing to save'
      }

      function onDocChanged() {
        if (!cm || !file) return
        markDirty(cm.state.doc.toString() !== lastSaved)
        updateDirtyUi()
      }

      // Debounced equality check keeps the dirty flag honest after undoing back
      // to the saved text without comparing every keystroke.
      const recheckDirty = debounce(() => {
        if (!cm || !file || disposed) return
        if (cm.state.doc.toString() === lastSaved && dirty) {
          markDirty(false)
          updateDirtyUi()
        }
      }, 250)

      function saveNow(force) {
        if (!cm || !file || saving) return
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
            session: target.sessionId,
            path: target.path,
            text: text,
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
              showBanner('This file changed on disk since you opened it. Saving would overwrite the newer version.', [
                {
                  label: 'Reload',
                  onClick: () => {
                    clearBanner()
                    openFile({ sessionId: target.sessionId, path: target.path }, true)
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
              updateDirtyUi()
              return
            }
            if (res.status >= 200 && res.status < 300 && payload && payload.ok) {
              lastSaved = text
              const stillDirty = cm.state.doc.toString() !== lastSaved
              markDirty(stillDirty)
              target.mtimeMs = typeof payload.mtimeMs === 'number' ? payload.mtimeMs : target.mtimeMs
              target.size = typeof payload.size === 'number' ? payload.size : target.size
              flashStatus(stillDirty ? 'Saved (more edits)' : 'Saved ' + fmtTime(new Date()))
              clearBanner()
            } else {
              const message =
                payload && payload.error
                  ? payload.error.message
                  : res.status === 409
                    ? 'This file changed on disk since you opened it.'
                    : 'Save failed (HTTP ' + res.status + ')'
              setStatus('Save failed', 'err')
              showBanner(message, [])
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
        const extensions = [
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
            {
              key: 'Mod-s',
              run: () => {
                saveNow(false)
                return true
              },
            },
          ]),
          CM.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onDocChanged()
              recheckDirty()
            }
          }),
          langCompartment.of([]),
          wrapCompartment.of([CM.EditorView.lineWrapping]),
        ]
        // The editor ALWAYS renders on the dark oneDark palette (owner's
        // choice): the Sidebar's panel uses the dark design tokens, and oneDark
        // keeps text and syntax colours readable on that background no matter
        // what the OS or app scheme reports - so no prefers-color-scheme probe.
        extensions.push(CM.oneDark)
        extensions.push(
          CM.EditorView.theme({
            '&': { height: '100%', fontSize: '12.5px' },
            '&.cm-focused': { outline: 'none' },
            // Gutters are transparent so the line-number strip shares the exact
            // code background (oneDark paints .cm-editor behind them).
            '.cm-gutters': { backgroundColor: 'transparent' },
            '.cm-activeLineGutter': { backgroundColor: 'transparent' },
            '.cm-scroller': {
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              fontSize: '12.5px',
              lineHeight: '1.6',
              color: 'var(--dsw-alias-label-primary,#d4d4d4)',
            },
          }),
        )
        cm = new CM.EditorView({
          parent: cmWrap,
          state: CM.EditorState.create({ doc: '', extensions: extensions }),
        })
        return cm
      }

      function applyLanguage(fileName) {
        if (!cm || !CM) return
        const language = languageExtensionFor(CM, fileName)
        const wrapped = isWrapFile(fileName)
        cm.dispatch({
          effects: [
            langCompartment.reconfigure(language ? [language] : []),
            wrapCompartment.reconfigure(wrapped ? [CM.EditorView.lineWrapping] : []),
          ],
        })
      }

      function setDocument(text) {
        if (!cm) return
        cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } })
      }

      /**
       * Load one file into this editor. Re-opening the file already shown is a
       * no-op unless `force` is given (a re-navigation of the same tab record
       * must not throw away unsaved edits).
       */
      async function openFile(target, force) {
        if (disposed) return
        if (!target || typeof target.sessionId !== 'string' || typeof target.path !== 'string') return
        const key = target.sessionId + '\u0000' + target.path
        if (!force && key === targetKey) return
        if (dirty && cm && file && key !== targetKey && !force) {
          // eslint-disable-next-line no-alert
          if (!window.confirm('Discard unsaved changes to ' + file.path + '?')) return
        }
        targetKey = key
        clearBanner()
        showState('loading', 'Opening\u2026', target.path)
        try {
          await ensureCmEngine()
          CM = CM || window.DSHEditorCM
          if (disposed) return
          const res = await fetch(
            FILE_ROUTE + '?session=' + encodeURIComponent(target.sessionId) + '&path=' + encodeURIComponent(target.path),
            { method: 'GET', credentials: 'same-origin' },
          )
          const payload = await res.json().catch(() => null)
          if (disposed) return
          if (!res.ok || !payload || !payload.ok) {
            const code = payload && payload.error ? payload.error.code : 'HTTP ' + res.status
            const message = payload && payload.error ? payload.error.message : 'Could not open this file.'
            file = null
            lastSaved = ''
            markDirty(false)
            filePath.textContent = ''
            if (code === 'NOT_TEXT') {
              showState('error', 'Not a text file', 'This file is binary or not valid UTF-8, so it cannot open in the text editor.')
            } else {
              showState('error', 'Could not open the file', message)
            }
            updateDirtyUi()
            return
          }
          ensureEditor()
          file = {
            sessionId: target.sessionId,
            path: payload.path || target.path,
            mtimeMs: typeof payload.mtimeMs === 'number' ? payload.mtimeMs : null,
            size: typeof payload.size === 'number' ? payload.size : null,
          }
          lastSaved = payload.text || ''
          markDirty(false)
          setDocument(lastSaved)
          applyLanguage(file.path)
          filePath.textContent = file.path
          filePath.title = file.path
          showState('edit')
          flashStatus('Opened')
          updateDirtyUi()
          try {
            cm.focus()
          } catch (e) {}
        } catch (err) {
          if (disposed) return
          file = null
          markDirty(false)
          showState('error', 'Editor unavailable', err && err.message ? err.message : String(err))
          updateDirtyUi()
        }
      }

      // ---- find-in-file wiring (the toolbar search drives CodeMirror's own) ----
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

      filePath.textContent = ''
      showState('loading', 'Opening\u2026', '')
      updateDirtyUi()

      return {
        open(target) {
          return openFile(target, false)
        },
        dispose() {
          disposed = true
          if (statusTimer) clearTimeout(statusTimer)
          if (cm) {
            try {
              cm.destroy()
            } catch (e) {}
            cm = null
          }
          dropTabState(tabId)
          if (toolRoot.parentNode) toolRoot.parentNode.removeChild(toolRoot)
        },
      }
    }

    // ---------------------------------------------------------------------
    // The tab bodies.
    // ---------------------------------------------------------------------

    /** Order one directory's entries for display: directories first, then by name. */
    function orderEntries(entries) {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      return [...entries].sort((left, right) => {
        const group = Number(right.type === 'directory') - Number(left.type === 'directory')
        return group !== 0 ? group : collator.compare(left.name, right.name)
      })
    }

    function childPath(parent, name) {
      return String(parent).replace(/[/\\]+$/, '') + '/' + name
    }

    function failureText(error) {
      if (!error) return 'Could not list this folder.'
      if (typeof error === 'string') return error
      if (error.code === 'workspace-file/not-found') return 'This folder no longer exists.'
      if (error.code === 'workspace-file/outside-workspace') return 'This folder is outside the workspace.'
      if (error.code === 'workspace-file/not-directory') return 'This path is not a folder.'
      return error.message || error.code || 'Could not list this folder.'
    }

    const NO_SESSIONS = () => undefined

    /**
     * The empty editor tab: browse the session workspace and hand the chosen
     * file to THIS tab record (`replaceTab`), so picking a file turns the empty
     * tab into that file's editor instead of leaving it behind.
     */
    function FilePicker(props) {
      const tab = props.tab
      const sessionId = props.sessionId
      const listDir = props.listDir
      // Called unconditionally (a conditional hook would change the call order
      // if the framework ever supplied it late).
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : NO_SESSIONS
      const cwd = useSessions((sessions) => {
        if (!sessions || !sessions.byId) return undefined
        const summary = sessions.byId[sessionId]
        return summary ? summary.cwd : undefined
      })
      const [dir, setDir] = useState(null)
      const [state, setState] = useState({ phase: 'loading', entries: [], error: null, truncated: false })

      useEffect(() => {
        if (dir === null && typeof cwd === 'string' && cwd !== '') setDir(cwd)
      }, [cwd, dir])

      useEffect(() => {
        if (dir === null || !sessionId || typeof listDir !== 'function') return undefined
        let alive = true
        setState({ phase: 'loading', entries: [], error: null, truncated: false })
        Promise.resolve()
          .then(() => listDir(sessionId, dir, tab.signal))
          .then((result) => {
            if (!alive) return
            if (!result || result.ok === false) {
              setState({ phase: 'error', entries: [], error: failureText(result && result.error), truncated: false })
              return
            }
            const value = result.value || result
            const entries = Array.isArray(value.entries) ? value.entries : []
            setState({ phase: 'ready', entries: orderEntries(entries), error: null, truncated: !!value.truncated })
          })
          .catch((err) => {
            if (!alive) return
            setState({ phase: 'error', entries: [], error: err && err.message ? err.message : String(err), truncated: false })
          })
        return () => {
          alive = false
        }
      }, [dir, sessionId])

      const here = typeof dir === 'string' ? dir : ''
      const root = typeof cwd === 'string' && cwd !== '' ? cwd.replace(/[/\\]+$/, '') : ''
      const shortPath = root !== '' && here.indexOf(root) === 0 ? here.slice(root.length).replace(/^[/\\]+/, '') : here

      const rows = []
      if (root !== '' && here !== root && here !== '') {
        rows.push(
          h(
            'button',
            { key: '..', type: 'button', className: 'dse-pickRow', onClick: () => setDir(here.replace(/[/\\][^/\\]*$/, '') || root) },
            h('span', { className: 'dse-pickIcon' }, GlyphUp()),
            h('span', { className: 'dse-pickName' }, '..'),
          ),
        )
      }
      for (const entry of state.entries) {
        const isDir = entry.type === 'directory'
        const path = childPath(here, entry.name)
        rows.push(
          h(
            'button',
            {
              key: (isDir ? 'd:' : 'f:') + entry.name,
              type: 'button',
              className: 'dse-pickRow',
              'aria-disabled': !isDir && entry.type !== 'file' ? 'true' : undefined,
              title: path,
              onClick: () => {
                if (isDir) {
                  setDir(path)
                  return
                }
                if (entry.type !== 'file') return
                if (tab.actions && typeof tab.actions.openResource === 'function') {
                  tab.actions.openResource(fileAddressFor(sessionId, root, path), { replaceTab: tab.id })
                }
              },
            },
            h('span', { className: 'dse-pickIcon' }, isDir ? GlyphFolder() : GlyphFile()),
            h('span', { className: 'dse-pickName' }, entry.name),
          ),
        )
      }

      return h(
        'div',
        { className: 'dse-pick' },
        h(
          'div',
          { className: 'dse-pickHead' },
          h('span', { className: 'dse-pickPath', title: here }, shortPath === '' ? 'Workspace' : shortPath),
          h(
            'button',
            {
              type: 'button',
              className: 'dse-pickBtn',
              title: 'Reload this folder',
              'aria-label': 'Reload this folder',
              onClick: () => setDir(typeof dir === 'string' ? dir : null),
            },
            GlyphRefresh(),
          ),
        ),
        h(
          'div',
          { className: 'dse-pickScroll' },
          state.phase === 'loading' ? h('div', { className: 'dse-pickNote' }, 'Listing\u2026') : null,
          state.phase === 'error' ? h('div', { className: 'dse-pickNote dse-pickErr' }, state.error || 'Could not list this folder.') : null,
          state.phase === 'ready' && rows.length === 0 ? h('div', { className: 'dse-pickNote' }, 'Nothing to open here.') : null,
          state.phase === 'ready' ? rows : null,
          state.phase === 'ready' && state.truncated ? h('div', { className: 'dse-pickNote' }, 'This folder has more entries than the listing returns.') : null,
        ),
      )
    }

    /** One file's editor: the CodeMirror surface behind a file tab record. */
    function EditorView(props) {
      const hostRef = useRef(null)
      const instanceRef = useRef(null)
      const file = props.file

      useEffect(() => {
        const instance = createEditorInstance(hostRef.current, props.tabId)
        instanceRef.current = instance
        instance.open({ sessionId: file.sessionId, path: file.path })
        return () => {
          instanceRef.current = null
          instance.dispose()
        }
      }, [props.tabId])

      // A re-navigation of the same record (a second open of the address) may
      // point somewhere else; the instance ignores the file it already shows.
      useEffect(() => {
        const instance = instanceRef.current
        if (instance) instance.open({ sessionId: file.sessionId, path: file.path })
      }, [file.sessionId, file.path, props.revision])

      return h('div', { className: 'dse-root', ref: hostRef, 'data-editor-tab': props.tabId })
    }

    /**
     * The tab body dispatched by `sidebar.right.pane.tab`: a file address gets
     * the editor, the page address gets the picker.
     */
    function EditorBody(props) {
      const info = props.useTabInfo()
      const tab = info.tab
      const file = parseFileAddress(tab.contentId)
      if (file && file.scope === 'session' && file.path !== '') {
        return h(EditorView, {
          key: tab.id,
          tabId: tab.id,
          file: file,
          revision: tab.navigation.revision,
        })
      }
      return h(FilePicker, {
        key: tab.id,
        tab: tab,
        sessionId: props.sessionId,
        listDir: props.listDir,
        useSessions: props.useSessions,
      })
    }

    /** The chip title: the captured basename, plus a dot while the file is dirty. */
    function EditorTitle(props) {
      const info = props.useTabInfo()
      const tab = info.tab
      const state = React.useSyncExternalStore(subscribeTabState, () => tabStateOf(tab.id))
      if (!state.dirty) return h('span', null, tab.title)
      return h(
        React.Fragment,
        null,
        h('span', { className: 'dse-titleDot', 'aria-hidden': true }),
        h('span', null, tab.title),
      )
    }

    // ---------------------------------------------------------------------
    // Registry definition
    // ---------------------------------------------------------------------
    function editorDefinition() {
      return {
        id: EDITOR_ID,
        kind: EDITOR_KIND,
        patterns: ['dsh-resource://file/**'],
        // Types from outside the product sit in the highest band, so text files
        // open editable instead of in the shipped read-only preview; `canOpen`
        // hands every file the previews own - and every path outside the
        // session workspace - back to them.
        priority: 'extension',
        canOpen: canOpenFile,
        title: (address) => (address === PAGE_ADDRESS ? 'Editor' : basenameOf(address)),
        guide: [
          {
            order: 20,
            title: () => 'Editor',
            description: () => 'Open a text or code file and edit it here',
            icon: EditorGlyph,
          },
        ],
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    const inject = ['slots', 'sidebarRightTabs', 'remote.workspaceFiles']

    function apply(ctx) {
      // The namespace is a service that mounts when its gateway contribution
      // lands, so re-resolve it on every listing instead of holding the first
      // answer.
      function refsNow() {
        try {
          const named = ctx.get ? ctx.get('remote.workspaceFiles') : undefined
          if (named && typeof named.list === 'function') return named
        } catch (e) {}
        try {
          const remote = ctx.get ? ctx.get('remote') : undefined
          const onRemote = remote && remote.workspaceFiles
          if (onRemote && typeof onRemote.list === 'function') return onRemote
        } catch (e) {}
        return undefined
      }

      function listDir(sessionId, path, signal) {
        const refs = refsNow()
        if (!refs) {
          return Promise.resolve({
            ok: false,
            error: { code: 'NO_REMOTE', message: 'The workspace file service is not available yet.' },
          })
        }
        try {
          return Promise.resolve(refs.list(sessionId, path, signal))
        } catch (err) {
          return Promise.resolve({ ok: false, error: { code: 'LIST_FAILED', message: err && err.message ? err.message : String(err) } })
        }
      }

      try {
        ctx.effect(() => ctx.sidebarRightTabs.register(editorDefinition()), 'dsh-editor: editor tab type')
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.right.pane.tab',
                  key: EDITOR_ID,
                  inject: () => ({ listDir: listDir }),
                },
                EditorBody,
              ),
            ),
          'dsh-editor: editor tab body',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab.title', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.right.pane.tab.title',
                  key: EDITOR_ID,
                },
                EditorTitle,
              ),
            ),
          'dsh-editor: editor tab title',
        )
        ctx.logger?.debug?.('[dsh-editor] editor tab type registered (' + PLUGIN_VERSION + ')')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dsh-editor] activation failed', err)
        ctx.logger?.warn?.('[dsh-editor] activation failed', err && err.message ? err.message : err)
      }
    }

    exports.name = 'dsh-editor'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})

// # sourceMappingURL=client.js.map
