/**
 * dsh-gittree — browser half.
 *
 * A tab TYPE for the pack's right bar (dsh-rightbar), the page kind beside the
 * shipped "Start" page, the "Files" tab and the pack's "Editor":
 *
 *   - the type registers through `ctx.sidebarRightTabs.register(...)` with the id
 *     `dsh-gittree` and the kind `gittree`. It is a PAGE type: it declares no
 *     `patterns`, so it never competes for a file address - `sidebar://gittree`
 *     is its only address, and its body and chip title register in the keyed
 *     seats `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title` under that
 *     same id, exactly like the tab types the product ships;
 *   - it contributes a guide entry, so the tab strip's "+" control (which opens
 *     the "Start" page) offers **GitTree** at `order: 30` - after Files (10) and
 *     Editor (20);
 *   - the body is the git tree of the tab's own conversation folder, read from
 *     the package's read-only `/api/dsh-gittree/*` routes: a **Tree** view (every
 *     tracked file plus the changed/untracked ones, each with a status badge) and
 *     a **History** view (the commit log; picking a commit shows its changed
 *     files). Nothing is ever written to the repository;
 *   - clicking a file row opens it through the ORDINARY file address -
 *     `dsh-resource://file/session/<sessionId>/<path>`, handed to the tab record's
 *     own `openResource` action with no options, exactly like a click in the
 *     Files tab - so the registry decides what claims it: the pack's editor for
 *     text, a shipped preview for an image or a PDF. The GitTree tab stays open;
 *   - the surface follows the pack's tab dress (the same toolbar/file-bar geometry
 *     and `--dsw-*` tokens the editor and the Files tab use, under its own `dsg-`
 *     prefix), so it reads as one more tab of the same bar and uninstalls without
 *     residue.
 *
 * No services beyond the bar's registry and the slot system are required: `fetch`
 * is the browser's own, and the session id arrives as a seat prop. The plugin
 * therefore keeps working on a profile that has no editor, no modal surface and
 * no theme package - a file row click simply lands wherever the registry sends it.
 *
 * Module-table format of every client bundle here; no build step.
 */
/* global window, document, fetch */
window.__ModuleLoader__.load({
  id: 'dsh-gittree',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    /** This implementation's identity in the tab system, and its slot key. */
    const TYPE_ID = 'dsh-gittree'
    /** The tab kind this package owns. */
    const KIND = 'gittree'
    /** The address a page tab of this kind is recorded under. */
    const PAGE_ADDRESS = 'sidebar://' + KIND
    /** Keep in sync with lib/index.js. */
    const API_ROOT = '/api/dsh-gittree'
    const STATE_ROUTE = API_ROOT + '/state'
    const HISTORY_ROUTE = API_ROOT + '/history'
    const COMMIT_ROUTE = API_ROOT + '/commit'
    /** Address grammar owned by @deepseek-ai/dsh-util-workspace-path. */
    const FILE_PREFIX = 'dsh-resource://file/'
    const SESSION_SEGMENT = 'session/'
    /** Version marker shown on the tool bar so a freshly loaded bundle is easy to verify. */
    const PLUGIN_VERSION = '0.1.0-alpha.1'
    /** The keyed seats every tab type occupies. */
    const TAB_SLOT = 'sidebar.right.pane.tab'
    const TITLE_SLOT = 'sidebar.right.pane.tab.title'
    /** How many commits one History page asks for. */
    const HISTORY_LIMIT = 60

    // ---------------------------------------------------------------------
    // Styles (the pack's tab dress, under this package's own prefix)
    // ---------------------------------------------------------------------
    const css = `
.dsg-root{height:100%;min-height:0;flex:auto;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;color:var(--dsw-alias-label-primary,#1f1f1f);font-size:13px;line-height:1.5}
.dsg-tools{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18))}
.dsg-seg{flex:none;display:inline-flex;align-items:center;height:26px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:6px;overflow:hidden}
.dsg-seg button{height:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:12.5px;padding:0 10px;cursor:pointer;white-space:nowrap}
.dsg-seg button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsg-find{flex:1;min-width:0;height:26px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.18));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);padding:0 8px;font:inherit;font-size:12.5px;outline:none}
.dsg-find::placeholder{color:var(--dsw-alias-label-tertiary,#999)}
.dsg-find:focus{border-color:var(--dsw-alias-state-accent,#4f8cff)}
.dsg-btn{flex:none;display:inline-flex;align-items:center;height:26px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:12.5px;padding:0 10px;cursor:pointer;white-space:nowrap}
.dsg-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsg-btn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}
.dsg-fileBar{flex:none;display:flex;align-items:center;gap:8px;padding:4px 10px 5px 12px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.14));font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999);min-width:0}
.dsg-branch{flex:none;display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary,#666);min-width:0}
.dsg-branchName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.dsg-sha{flex:none;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;opacity:.85}
.dsg-spacer{flex:1;min-width:0}
.dsg-ver{flex:none;white-space:nowrap;opacity:.7}
.dsg-body{flex:1;min-height:0;overflow:auto;position:relative}
.dsg-state{height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;color:var(--dsw-alias-label-tertiary,#999);font-size:12.5px;line-height:18px;text-align:center}
.dsg-stateTitle{font-size:13px;color:var(--dsw-alias-label-secondary,#666);font-weight:500}
.dsg-stateErr{color:var(--dsw-alias-state-error-primary,#d3382c)}
.dsg-stateCode{font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:11px;opacity:.8}
.dsg-list{margin:0;padding:6px 4px 12px 6px;list-style:none}
.dsg-level{margin:0;padding:0 0 0 14px;list-style:none}
.dsg-item{margin:0;padding:0}
.dsg-row{width:100%;min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;display:flex;align-items:center;gap:6px;padding:4px 8px}
.dsg-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsg-twisty{flex:none;width:12px;color:var(--dsw-alias-label-tertiary,#999);font-size:10px;line-height:1}
.dsg-glyph{flex:none;color:var(--dsw-alias-label-tertiary,#999)}
.dsg-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsg-dirRow .dsg-name{color:var(--dsw-alias-label-primary,#1f1f1f)}
.dsg-count{flex:none;font-size:10.5px;line-height:1;padding:2px 5px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary,#666)}
.dsg-badge{flex:none;min-width:14px;text-align:center;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:10.5px;line-height:1;padding:3px 4px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-secondary,#666)}
.dsg-badge[data-st="m"]{background:var(--dsw-alias-state-warning-primary,#d29922);color:#fff}
.dsg-badge[data-st="a"]{background:var(--dsw-alias-state-success-primary,#2f9e44);color:#fff}
.dsg-badge[data-st="d"]{background:var(--dsw-alias-state-error-primary,#d3382c);color:#fff}
.dsg-badge[data-st="r"]{background:var(--dsw-alias-state-business-primary,#4f8cff);color:#fff}
.dsg-badge[data-st="u"]{background:var(--dsw-alias-state-error-primary,#d3382c);color:#fff}
.dsg-commitRow{width:100%;min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;display:flex;align-items:baseline;gap:8px;padding:5px 8px}
.dsg-commitRow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsg-commitRow[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsg-commitSha{flex:none;font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary,#666)}
.dsg-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsg-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap}
.dsg-detail{margin:2px 8px 10px 8px;padding:8px 10px;border-left:2px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.06));border-radius:0 8px 8px 0}
.dsg-detailHead{font-size:11.5px;color:var(--dsw-alias-label-secondary,#666);margin-bottom:6px;word-break:break-word}
.dsg-detailBody{white-space:pre-wrap;font-size:12px;color:var(--dsw-alias-label-primary,#1f1f1f);margin:0 0 6px 0}
.dsg-detailEmpty{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);margin:0}
.dsg-detailList{margin:0;padding:0;list-style:none}
.dsg-note{margin:0;padding:6px 10px;color:var(--dsw-alias-label-tertiary,#999);font-size:11.5px}
`
    const CSS_TAG = 'dsh-gittree/gittree.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-gittree'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = css
      document.head.appendChild(tag)
    }

    // ---------------------------------------------------------------------
    // Address helpers (the grammar @deepseek-ai/dsh-util-workspace-path owns:
    // `dsh-resource://file/session/<sessionId>/<path-segments>`, one
    // component-encoded segment per path segment, `:` kept literal). A row click
    // is handed to the tab record's own `openResource` action, so the registry -
    // not this package - decides what claims the file.
    // ---------------------------------------------------------------------
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }

    /** Build a session-scoped file address for a workspace-relative path. */
    function sessionFileAddress(sessionId, path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      return FILE_PREFIX + SESSION_SEGMENT + encodeSegment(sessionId) + '/' + normalized.split('/').map(encodeSegment).join('/')
    }

    // ---------------------------------------------------------------------
    // Status helpers
    // ---------------------------------------------------------------------
    const STATUS_NAMES = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', T: 'type changed' }

    /** The single letter a row shows: the first side of the `XY` pair that is set. */
    function statusLetter(entry) {
      if (entry.status === '??') return '?'
      if (entry.unmerged || entry.status.indexOf('U') >= 0) return 'U'
      const letters = entry.status.replace(/[.\s]/g, '')
      return letters === '' ? 'M' : letters[0]
    }

    /** The badge's colour key. */
    function statusKind(entry) {
      if (entry.status === '??') return 'untracked'
      if (entry.unmerged || entry.status.indexOf('U') >= 0) return 'u'
      return statusLetter(entry).toLowerCase()
    }

    /** The badge's tooltip: staged vs worktree, plus a rename's source. */
    function statusTitle(entry) {
      if (entry.status === '??') return 'Untracked'
      if (entry.unmerged || entry.status.indexOf('U') >= 0) return 'Unmerged'
      const parts = []
      const staged = STATUS_NAMES[entry.status[0]]
      const worktree = STATUS_NAMES[entry.status[1]]
      if (staged) parts.push('staged: ' + staged)
      if (worktree) parts.push('worktree: ' + worktree)
      if (entry.origPath) parts.push('from ' + entry.origPath)
      return parts.join(', ') || 'changed'
    }

    // ---------------------------------------------------------------------
    // The tree
    // ---------------------------------------------------------------------
    /**
     * Fold the flat entry list into a directory tree, keeping the filter and the
     * changed-only switch in mind.
     * @returns `{ dirs: Map<name, node>, files: entry[] }`.
     */
    function buildTree(entries, filter, changedOnly) {
      const root = { dirs: new Map(), files: [] }
      const needle = filter.trim().toLowerCase()
      for (const entry of entries) {
        if (changedOnly && entry.status === '') continue
        if (needle !== '' && entry.path.toLowerCase().indexOf(needle) < 0) continue
        const segments = entry.path.split('/')
        let node = root
        for (let i = 0; i < segments.length - 1; i++) {
          const name = segments[i]
          let next = node.dirs.get(name)
          if (next === undefined) {
            next = { dirs: new Map(), files: [] }
            node.dirs.set(name, next)
          }
          node = next
        }
        node.files.push(entry)
      }
      return root
    }

    /** How many changed files live under one node (the directory row's count). */
    function countChanged(node) {
      let total = 0
      for (const file of node.files) if (file.status !== '') total += 1
      for (const child of node.dirs.values()) total += countChanged(child)
      return total
    }

    /** A file-system glyph for a directory row. */
    function FolderGlyph(props) {
      return h(
        'svg',
        {
          width: 13,
          height: 13,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          className: props && props.className ? props.className : undefined,
        },
        h('path', { d: 'M1.5 4.5h4l1.2 1.6h7.8v6.4h-13z' }),
      )
    }

    /** The guide capsule's glyph (drawn before "GitTree" on the Start page). */
    function GitTreeGlyph(props) {
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
        h('circle', { cx: 4, cy: 3.2, r: 1.6 }),
        h('circle', { cx: 4, cy: 12.8, r: 1.6 }),
        h('circle', { cx: 12, cy: 6, r: 1.6 }),
        h('path', { d: 'M4 4.8v6.4' }),
        h('path', { d: 'M12 7.6c0 2-1.6 2.6-3.4 3.2' }),
      )
    }

    /** One file row: the status badge, the name, and the click-through. */
    function FileRow(props) {
      const entry = props.entry
      const name = entry.path.slice(entry.path.lastIndexOf('/') + 1)
      return h(
        'button',
        {
          type: 'button',
          className: 'dsg-row',
          'data-gittree-row': 'file',
          'data-gittree-path': entry.path,
          title: entry.origPath ? entry.origPath + ' \u2192 ' + entry.path : entry.path,
          onClick: () => props.onOpen(entry.path),
        },
        h('span', { className: 'dsg-twisty' }),
        h('span', { className: 'dsg-name' }, name),
        entry.status === ''
          ? null
          : h('span', { className: 'dsg-badge', 'data-st': statusKind(entry), title: statusTitle(entry) }, statusLetter(entry)),
      )
    }

    /**
     * One directory level. Directories sort before files, both by name, which is
     * the order the Files tab shows as well. Directories start COLLAPSED - the
     * root level is the whole first impression - and the filter and the
     * changed-only switch auto-expand everything below, so a search never leaves
     * its hits hidden inside a closed folder.
     */
    function TreeLevel(props) {
      const node = props.node
      const prefix = props.prefix
      const items = []
      const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))
      for (const name of dirNames) {
        const path = prefix === '' ? name : prefix + '/' + name
        const child = node.dirs.get(name)
        const open = props.autoExpand === true || props.expanded[path] === true
        const changed = props.counts === false ? 0 : countChanged(child)
        items.push(
          h(
            'li',
            { key: 'd:' + path, className: 'dsg-item' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsg-row dsg-dirRow',
                'data-gittree-row': 'dir',
                'data-gittree-path': path,
                'data-gittree-open': open ? 'true' : 'false',
                title: path,
                onClick: () => props.onToggle(path),
              },
              h('span', { className: 'dsg-twisty' }, open ? '\u25be' : '\u25b8'),
              h(FolderGlyph, { className: 'dsg-glyph' }),
              h('span', { className: 'dsg-name' }, name),
              changed > 0 ? h('span', { className: 'dsg-count', title: changed + ' changed' }, String(changed)) : null,
            ),
            open
              ? h(
                  'ul',
                  { className: 'dsg-level' },
                  h(TreeLevel, {
                    node: child,
                    prefix: path,
                    expanded: props.expanded,
                    autoExpand: props.autoExpand,
                    onToggle: props.onToggle,
                    onOpen: props.onOpen,
                    counts: props.counts,
                  }),
                )
              : null,
          ),
        )
      }
      const files = node.files.slice().sort((a, b) => a.path.localeCompare(b.path))
      for (const entry of files) {
        items.push(h('li', { key: 'f:' + entry.path, className: 'dsg-item' }, h(FileRow, { entry, onOpen: props.onOpen })))
      }
      return h(React.Fragment, null, items)
    }

    // ---------------------------------------------------------------------
    // Data access (the package's read-only routes)
    // ---------------------------------------------------------------------
    /**
     * One route call. The answer's `{ ok, error }` envelope becomes a thrown
     * error carrying the server's own code, so the surface can say *why* (no
     * workspace, not a repository, git missing, …) instead of "failed".
     */
    async function fetchJson(url) {
      let response
      try {
        response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      } catch (err) {
        const error = new Error('The request to the plugin route failed.')
        error.code = 'NETWORK'
        throw error
      }
      let payload = null
      try {
        payload = await response.json()
      } catch (err) {
        payload = null
      }
      if (!response.ok || !payload || payload.ok !== true) {
        const detail = payload && payload.error ? payload.error : null
        const error = new Error(detail && detail.message ? detail.message : 'The request failed (HTTP ' + response.status + ').')
        error.code = detail && detail.code ? detail.code : 'HTTP_' + response.status
        throw error
      }
      return payload
    }

    // ---------------------------------------------------------------------
    // The tab body
    // ---------------------------------------------------------------------
    /**
     * The GitTree surface: a Tree view and a History view over the tab's own
     * conversation folder. Everything is read on demand - opening the tab is what
     * triggers the first request, and History waits until it is shown.
     */
    function GitTreeView(props) {
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
      const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
      const tabActions = info && info.tab && info.tab.actions ? info.tab.actions : null

      const [view, setView] = useState('tree')
      const [state, setState] = useState({ phase: 'loading', data: null, error: null })
      const [history, setHistory] = useState({ phase: 'idle', commits: [], error: null })
      const [selected, setSelected] = useState(null)
      const [detail, setDetail] = useState({ phase: 'idle', data: null, error: null })
      const [filter, setFilter] = useState('')
      const [changedOnly, setChangedOnly] = useState(false)
      const [expanded, setExpanded] = useState({})

      const loadTree = useCallback(() => {
        if (sessionId === '') {
          setState({ phase: 'error', data: null, error: { code: 'NO_SESSION', message: 'This tab has no conversation to read a workspace from.' } })
          return
        }
        setState({ phase: 'loading', data: null, error: null })
        let live = true
        fetchJson(STATE_ROUTE + '?session=' + encodeURIComponent(sessionId))
          .then((data) => {
            if (live) setState({ phase: 'ready', data, error: null })
          })
          .catch((err) => {
            if (live) setState({ phase: 'error', data: null, error: { code: err.code || 'ERROR', message: err.message } })
          })
        return () => {
          live = false
        }
      }, [sessionId])

      const loadHistory = useCallback(() => {
        if (sessionId === '') return undefined
        setHistory({ phase: 'loading', commits: [], error: null })
        let live = true
        fetchJson(HISTORY_ROUTE + '?session=' + encodeURIComponent(sessionId) + '&limit=' + String(HISTORY_LIMIT))
          .then((data) => {
            if (live) setHistory({ phase: 'ready', commits: data.commits || [], error: null, empty: data.empty === true })
          })
          .catch((err) => {
            if (live) setHistory({ phase: 'error', commits: [], error: { code: err.code || 'ERROR', message: err.message } })
          })
        return () => {
          live = false
        }
      }, [sessionId])

      useEffect(() => loadTree(), [loadTree])

      useEffect(() => {
        if (view !== 'history' || history.phase !== 'idle') return undefined
        return loadHistory()
      }, [view, history.phase, loadHistory])

      const openFile = useCallback(
        (path) => {
          if (!tabActions || typeof tabActions.openResource !== 'function') return
          // No options: the registry's own ranking picks the tab type - the editor
          // for text, a shipped preview for anything it owns. This is the same
          // call the Files tab makes for a click.
          tabActions.openResource(sessionFileAddress(sessionId, path))
        },
        [tabActions, sessionId],
      )

      const pickCommit = useCallback(
        (commit) => {
          if (selected === commit.sha) {
            setSelected(null)
            setDetail({ phase: 'idle', data: null, error: null })
            return
          }
          setSelected(commit.sha)
          setDetail({ phase: 'loading', data: null, error: null })
          let live = true
          fetchJson(COMMIT_ROUTE + '?session=' + encodeURIComponent(sessionId) + '&sha=' + encodeURIComponent(commit.sha))
            .then((data) => {
              if (live) setDetail({ phase: 'ready', data, error: null })
            })
            .catch((err) => {
              if (live) setDetail({ phase: 'error', data: null, error: { code: err.code || 'ERROR', message: err.message } })
            })
          return () => {
            live = false
          }
        },
        [selected, sessionId],
      )

      const toggleDir = useCallback((path) => {
        setExpanded((current) => {
          const next = { ...current }
          if (next[path] === true) delete next[path]
          else next[path] = true
          return next
        })
      }, [])

      const data = state.data
      const entries = data && Array.isArray(data.entries) ? data.entries : []
      const tree = useMemo(() => buildTree(entries, filter, changedOnly), [entries, filter, changedOnly])
      // A filter or the changed-only switch opens every folder: a hit inside a
      // closed directory would otherwise be invisible.
      const autoExpand = filter.trim() !== '' || changedOnly

      // ---- the tool bar (both views) ----
      const tools = h(
        'div',
        { className: 'dsg-tools' },
        h(
          'div',
          { className: 'dsg-seg', role: 'group' },
          h(
            'button',
            { type: 'button', 'aria-pressed': view === 'tree' ? 'true' : 'false', 'data-gittree-view': 'tree', onClick: () => setView('tree') },
            'Tree',
          ),
          h(
            'button',
            { type: 'button', 'aria-pressed': view === 'history' ? 'true' : 'false', 'data-gittree-view': 'history', onClick: () => setView('history') },
            'History',
          ),
        ),
        view === 'tree'
          ? h('input', {
              type: 'text',
              className: 'dsg-find',
              placeholder: 'Filter paths\u2026',
              spellCheck: false,
              value: filter,
              'data-gittree-filter': true,
              onChange: (event) => setFilter(event.target.value),
            })
          : h('span', { className: 'dsg-spacer' }),
        view === 'tree'
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsg-btn',
                'aria-pressed': changedOnly ? 'true' : 'false',
                'data-gittree-changed': changedOnly ? 'true' : 'false',
                title: 'Show only files git reports as changed',
                onClick: () => setChangedOnly((value) => !value),
              },
              'Changed',
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsg-btn',
            'data-gittree-reload': true,
            title: 'Reload from disk',
            onClick: () => (view === 'history' ? loadHistory() : loadTree()),
          },
          'Reload',
        ),
      )

      // ---- the file bar: branch, head, counts, version ----
      const ahead = data && data.ahead > 0 ? ' \u2191' + data.ahead : ''
      const behind = data && data.behind > 0 ? ' \u2193' + data.behind : ''
      const fileBar = h(
        'div',
        { className: 'dsg-fileBar' },
        h(
          'span',
          { className: 'dsg-branch', title: data ? 'branch ' + (data.branch || '(detached)') + (data.repoRoot ? ' in ' + data.repoRoot : '') : '' },
          h(GitTreeGlyph, { size: 13, className: 'dsg-glyph' }),
          h('span', { className: 'dsg-branchName' }, data ? data.branch || (data.detached ? '(detached)' : '(no commits)') : '\u2026'),
          ahead + behind !== '' ? h('span', null, ahead + behind) : null,
        ),
        data && data.head ? h('span', { className: 'dsg-sha', 'data-gittree-head': data.head }, data.head) : null,
        h('span', { className: 'dsg-spacer' }),
        data
          ? h(
              'span',
              { className: 'dsg-note', 'data-gittree-counts': String(data.total) },
              String(data.changed) + ' changed \u00b7 ' + String(data.total) + ' files' + (data.truncated ? ' (truncated)' : ''),
            )
          : null,
        h('span', { className: 'dsg-ver', title: 'dsh-gittree ' + PLUGIN_VERSION }, PLUGIN_VERSION),
      )

      // ---- the body ----
      let body = null
      if (state.phase === 'error') {
        body = h(
          'div',
          { className: 'dsg-state dsg-stateErr', 'data-gittree-state': 'error' },
          h('div', { className: 'dsg-stateTitle' }, stateTitle(state.error)),
          h('div', null, state.error && state.error.message ? state.error.message : 'The git tree could not be read.'),
          h('div', { className: 'dsg-stateCode' }, state.error && state.error.code ? state.error.code : ''),
        )
      } else if (state.phase === 'loading') {
        body = h('div', { className: 'dsg-state', 'data-gittree-state': 'loading' }, h('div', { className: 'dsg-stateTitle' }, 'Reading the git tree\u2026'))
      } else if (view === 'history') {
        body = h(HistoryView, { history, selected, detail, onPick: pickCommit, onOpen: openFile })
      } else if (data && data.total === 0) {
        body = h(
          'div',
          { className: 'dsg-state', 'data-gittree-state': 'empty' },
          h('div', { className: 'dsg-stateTitle' }, 'Nothing to show yet'),
          h('div', null, data.branch === '' && data.head === '' ? 'This repository has no commits.' : 'No tracked files in this workspace.'),
        )
      } else {
        const visible = countVisible(tree)
        body = h(
          'div',
          { className: 'dsg-body', 'data-gittree-state': 'tree' },
          visible === 0
            ? h('p', { className: 'dsg-note', 'data-gittree-row': 'empty' }, 'No path matches this filter.')
            : h('ul', { className: 'dsg-list' }, h(TreeLevel, { node: tree, prefix: '', expanded, autoExpand, onToggle: toggleDir, onOpen: openFile, counts: !changedOnly })),
        )
      }

      return h(
        'div',
        { className: 'dsg-root', 'data-gittree-tab': info && info.tab ? info.tab.id : '', 'data-gittree-address': PAGE_ADDRESS },
        tools,
        fileBar,
        body,
      )
    }

    /** How many rows the filtered tree would draw (directories + files). */
    function countVisible(node) {
      let total = node.files.length + node.dirs.size
      for (const child of node.dirs.values()) total += countVisible(child)
      return total
    }

    /** A short, honest headline for a typed failure. */
    function stateTitle(error) {
      const code = error && error.code ? error.code : ''
      if (code === 'NO_WORKSPACE') return 'No workspace folder'
      if (code === 'NOT_A_REPO') return 'Not a git repository'
      if (code === 'GIT_MISSING') return 'git is not installed'
      if (code === 'TIMEOUT') return 'git timed out'
      if (code === 'GIT_FAILED') return 'git refused the request'
      if (code === 'NO_SESSION') return 'No conversation'
      return 'Could not read the git tree'
    }

    // ---------------------------------------------------------------------
    // The History view
    // ---------------------------------------------------------------------
    /** The commit log; picking a row opens that commit's changed files. */
    function HistoryView(props) {
      const history = props.history
      if (history.phase === 'error') {
        return h(
          'div',
          { className: 'dsg-state dsg-stateErr', 'data-gittree-state': 'history-error' },
          h('div', { className: 'dsg-stateTitle' }, stateTitle(history.error)),
          h('div', null, history.error && history.error.message ? history.error.message : 'The history could not be read.'),
        )
      }
      if (history.phase === 'loading' || history.phase === 'idle') {
        return h('div', { className: 'dsg-state', 'data-gittree-state': 'history-loading' }, h('div', { className: 'dsg-stateTitle' }, 'Reading the history\u2026'))
      }
      if (history.commits.length === 0) {
        return h(
          'div',
          { className: 'dsg-state', 'data-gittree-state': 'history-empty' },
          h('div', { className: 'dsg-stateTitle' }, 'No commits yet'),
          h('div', null, 'Nothing has been committed in this workspace.'),
        )
      }
      const rows = []
      for (const commit of history.commits) {
        const open = props.selected === commit.sha
        rows.push(
          h(
            'li',
            { key: commit.sha, className: 'dsg-item' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsg-commitRow',
                'aria-expanded': open ? 'true' : 'false',
                'data-gittree-commit': commit.sha,
                title: commit.sha + ' \u2014 ' + commit.subject,
                onClick: () => props.onPick(commit),
              },
              h('span', { className: 'dsg-commitSha' }, commit.short),
              h('span', { className: 'dsg-subject' }, commit.subject),
              h('span', { className: 'dsg-meta' }, commit.author + ' \u00b7 ' + commit.date),
            ),
            open ? h(CommitDetail, { detail: props.detail, onOpen: props.onOpen }) : null,
          ),
        )
      }
      return h('div', { className: 'dsg-body', 'data-gittree-state': 'history' }, h('ul', { className: 'dsg-list' }, rows))
    }

    /** One commit: its header, its message and the files it touched. */
    function CommitDetail(props) {
      const detail = props.detail
      if (detail.phase === 'loading' || detail.phase === 'idle') {
        return h('div', { className: 'dsg-detail', 'data-gittree-state': 'commit-loading' }, h('p', { className: 'dsg-detailEmpty' }, 'Reading the commit\u2026'))
      }
      if (detail.phase === 'error') {
        return h(
          'div',
          { className: 'dsg-detail dsg-stateErr', 'data-gittree-state': 'commit-error' },
          h('p', { className: 'dsg-detailEmpty' }, (detail.error && detail.error.message) || 'The commit could not be read.'),
        )
      }
      const data = detail.data
      const commit = data && data.commit ? data.commit : null
      const files = data && Array.isArray(data.files) ? data.files : []
      return h(
        'div',
        { className: 'dsg-detail', 'data-gittree-state': 'commit' },
        h(
          'div',
          { className: 'dsg-detailHead' },
          commit ? commit.sha : '',
          commit ? ' \u00b7 ' + commit.author + ' \u00b7 ' + commit.date : '',
        ),
        commit && commit.body ? h('pre', { className: 'dsg-detailBody' }, commit.body) : null,
        files.length === 0
          ? h('p', { className: 'dsg-detailEmpty', 'data-gittree-row': 'commit-empty' }, 'No files changed in this commit.')
          : h(
              'ul',
              { className: 'dsg-detailList' },
              files.map((file) =>
                h(
                  'li',
                  { key: file.path, className: 'dsg-item' },
                  h(FileRow, { entry: { path: file.path, status: file.status, origPath: file.origPath }, onOpen: props.onOpen }),
                ),
              ),
            ),
      )
    }

    // ---------------------------------------------------------------------
    // The chip title
    // ---------------------------------------------------------------------
    /** The tab strip's label for this kind (the guide entry names the same word). */
    function GitTreeTitle() {
      return h('span', { className: 'dsg-title' }, 'GitTree')
    }

    // ---------------------------------------------------------------------
    // Registry definition
    // ---------------------------------------------------------------------
    function gitTreeDefinition() {
      return {
        id: TYPE_ID,
        kind: KIND,
        // A PAGE type: no `patterns`, so it never claims a file address. Files the
        // tree opens go through the ordinary `dsh-resource://file/**` grammar and
        // are claimed by whoever registers for it (the editor, a shipped preview).
        priority: 'builtin',
        title: () => 'GitTree',
        guide: [
          {
            order: 30,
            title: () => 'GitTree',
            description: () => 'Browse this workspace\u2019s git tree and commits',
            icon: GitTreeGlyph,
          },
        ],
      }
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------
    /** Services the activation waits for: the slot registry and the bar's tab registry. */
    const inject = ['slots', 'sidebarRightTabs']

    function apply(ctx) {
      try {
        ctx.effect(() => ctx.sidebarRightTabs.register(gitTreeDefinition()), 'dsh-gittree: gittree tab type')
        ctx.effect(
          () =>
            ctx.slots.inject(TAB_SLOT, () =>
              ctx.slots.register(
                {
                  name: TAB_SLOT,
                  key: TYPE_ID,
                },
                GitTreeView,
              ),
            ),
          'dsh-gittree: gittree tab body',
        )
        ctx.effect(
          () =>
            ctx.slots.inject(TITLE_SLOT, () =>
              ctx.slots.register(
                {
                  name: TITLE_SLOT,
                  key: TYPE_ID,
                },
                GitTreeTitle,
              ),
            ),
          'dsh-gittree: gittree tab title',
        )
        ctx.logger?.debug?.('[dsh-gittree] git tree tab type registered (' + PLUGIN_VERSION + ')')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[dsh-gittree] activation failed', err)
        ctx.logger?.warn?.('[dsh-gittree] activation failed', err && err.message ? err.message : err)
      }
    }

    exports.name = 'dsh-gittree'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
