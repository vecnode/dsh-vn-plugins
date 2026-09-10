// check-client-bundles.mjs - load the pack's browser bundles the way the shell
// does (module table + factory) and drive them with a REAL React runtime.
//
// Why this exists: the client halves have no build step and no type checker, so
// a typo or a wrong hook call is otherwise only found in the running GUI. This
// harness registers each bundle through its own `window.__ModuleLoader__.load`,
// activates it against a stub cordis context, and renders the resulting React
// trees with the machine's own react-dom (server renderer: hooks that need a
// browser - useEffect, useSyncExternalStore without a server snapshot - are
// skipped, exactly like any server render).
//
// Run:  node scripts/checks/check-client-bundles.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const repo = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))

/** A React + react-dom pair to render with: the profile's, else any npm cache's. */
function loadReact() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const roots = [path.join(home, 'profiles', 'node_modules')]
  // npm's on-demand cache: the Local/AppData folders on Windows, ~/.npm/_npx
  // on macOS/Linux. Global installs are the other place a pair can live.
  const caches = [process.env.LOCALAPPDATA, process.env.APPDATA]
    .filter(Boolean)
    .map((base) => path.join(base, 'npm-cache', '_npx'))
  caches.push(path.join(os.homedir(), '.npm', '_npx'))
  for (const cache of caches) {
    if (!existsSync(cache)) continue
    for (const entry of readdirSync(cache)) roots.push(path.join(cache, entry, 'node_modules'))
  }
  roots.push('/usr/local/lib/node_modules', '/usr/lib/node_modules')
  for (const root of roots) {
    try {
      const requireFrom = createRequire(path.join(root, 'index.js'))
      const React = requireFrom('react')
      const server = requireFrom('react-dom/server')
      if (typeof server.renderToStaticMarkup === 'function') {
        return { React, jsxRuntime: requireFrom('react/jsx-runtime'), renderToStaticMarkup: server.renderToStaticMarkup }
      }
    } catch (err) {
      /* try the next root */
    }
  }
  throw new Error('no react + react-dom pair found (looked in the profile and the npm caches)')
}

const { React, jsxRuntime, renderToStaticMarkup } = loadReact()
const h = React.createElement
let failures = 0
function check(label, actual, expected) {
  const ok = expected === undefined ? Boolean(actual) : actual === expected
  if (!ok) failures += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label.padEnd(30) + (expected === undefined ? '' : ' ' + JSON.stringify(actual)))
  return ok
}

/** A DOM stand-in: enough for the style-tag injection and detached elements. */
function fakeDocument() {
  const element = () => ({
    dataset: {},
    style: {},
    children: [],
    textContent: '',
    value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      this.children.push(child)
      return child
    },
    insertBefore(child) {
      this.children.push(child)
      return child
    },
    remove() {},
    focus() {},
    select() {},
    querySelector: () => null,
    parentNode: null,
  })
  return {
    head: { appendChild() {} },
    body: element(),
    querySelector: () => null,
    createElement: () => element(),
    addEventListener() {},
    removeEventListener() {},
    activeElement: null,
    contains: () => false,
  }
}

/** Capture one module-table bundle's factory and run it. */
function loadBundle(relative, extraRequire) {
  const file = path.join(repo, relative)
  const window = { __ModuleLoader__: {} }
  const document = fakeDocument()
  let entry = null
  window.__ModuleLoader__.load = (value) => {
    entry = value
  }
  new Function('window', 'document', 'console', readFileSync(file, 'utf8'))(window, document, console)
  if (entry === null) throw new Error('bundle did not register with the module loader: ' + relative)
  const require = (name) => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react-dom/client') return extraRequire.reactDomClient
    // Seeded by the shell in the real app; stubbed here.
    if (name === '@deepseek-ai/dsh-client-store') {
      return {
        createSnapshotStore: (initial) => ({ get: () => initial, set() {}, subscribe: () => () => {} }),
        notifySubscribers() {},
      }
    }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') {
      const Null = () => null
      return { Menu: Null, Tooltip: Null, IconChevronDownOutline14: Null }
    }
    throw new Error('unexpected require in a client bundle: ' + name)
  }
  return { id: entry.id, exports: entry.factory(require), document }
}

// ---------------------------------------------------------------- dsh-modal
const captured = {}
const modal = loadBundle('packages/dsh-modal/lib/client.js', {
  reactDomClient: {
    createRoot(container) {
      captured.container = container
      return {
        render(element) {
          captured.element = element
        },
        unmount() {},
      }
    },
  },
})
const provided = {}
modal.exports.apply({
  reflect: {
    provide(name, value) {
      provided[name] = value
      return () => {}
    },
  },
  get: () => undefined,
  effect: (fn) => fn(),
  logger: { debug() {}, warn() {} },
})
check('modal bundle id', modal.id, 'dsh-modal')
check('modals service provided', typeof provided.modals, 'object')
check('modals api', Object.keys(provided.modals).sort().join(','), 'alert,close,confirm,isOpen,open,prompt')
check('body-level host created', captured.container && captured.container.dataset.dshModalHost !== undefined)
check('idle render is empty', renderToStaticMarkup(captured.element), '')

const modals = provided.modals
const pending = modals.open({
  title: 'Save new file',
  message: 'Saved in the conversation folder.',
  fields: [{ name: 'path', label: 'File name (with extension)', value: 'untitled.txt', hint: 'Example: src/app.ts', required: true }],
  validate: () => '',
  confirmLabel: 'Save',
  busyLabel: 'Saving\u2026',
})
const markup = renderToStaticMarkup(captured.element)
check('dialog renders title', markup.includes('Save new file'))
check('dialog renders field', markup.includes('File name (with extension)') && markup.includes('value="untitled.txt"'))
check('dialog renders buttons', markup.includes('>Save<') && markup.includes('>Cancel<'))
check('dialog is modal', markup.includes('aria-modal="true"'))
modals.close(null)
check('cancel resolves null', await pending, null)
check('closed render is empty', renderToStaticMarkup(captured.element), '')
check('isOpen after close', modals.isOpen(), false)
const promptPromise = modals.prompt({ title: 'Name', label: 'Name', value: 'abc' })
check('prompt opens a dialog', modals.isOpen())
modals.close({ value: 'typed' })
check('prompt resolves the value', await promptPromise, 'typed')
const alertPromise = modals.alert('Done')
const alertMarkup = renderToStaticMarkup(captured.element)
check('alert has one button', alertMarkup.includes('>OK<') && !alertMarkup.includes('>Cancel<'))
modals.close()
await alertPromise

// --------------------------------------------------------------- dsh-editor
const editor = loadBundle('packages/dsh-editor/lib/client.js', {})
check('editor bundle id', editor.id, 'dsh-editor')
check('editor inject', JSON.stringify(editor.exports.inject), '["slots","sidebarRightTabs"]')
const registered = {}
const types = []
editor.exports.apply({
  get: (name) => (name === 'modals' ? modals : undefined),
  slots: {
    inject: (name, fn) => fn(),
    register(spec, component) {
      registered[spec.name + (spec.key ? '#' + spec.key : '')] = { spec, component }
      return () => {}
    },
  },
  sidebarRightTabs: {
    register(definition) {
      types.push(definition)
      return () => {}
    },
  },
  effect: (fn) => fn(),
  logger: { debug() {}, warn() {} },
})
check('tab type registered', types.length === 1 && types[0].id + '/' + types[0].kind, 'dsh-editor/editor')
check('page title', types[0].title('sidebar://editor'), 'Editor')
check('file title', types[0].title('dsh-resource://file/session/s1/src/app.ts'), 'app.ts')
check('claims a text file', types[0].canOpen('dsh-resource://file/session/s1/src/app.ts'), true)
check('vetoes markdown', types[0].canOpen('dsh-resource://file/session/s1/readme.md'), false)
check('vetoes absolute', types[0].canOpen('dsh-resource://file/session/s1/C:/x.ts'), false)
check('guide entry', types[0].guide.map((entry) => entry.title()).join(','), 'Editor')
check('body + title seats', Object.keys(registered).sort().join(','), 'sidebar.right.pane.tab#dsh-editor,sidebar.right.pane.tab.title#dsh-editor')
const facade = registered['sidebar.right.pane.tab#dsh-editor'].spec.inject()
check('body resolves modals lazily', facade.getModals(), modals)
const Body = registered['sidebar.right.pane.tab#dsh-editor'].component
const blankTab = { id: 'tab1', contentId: 'sidebar://editor', title: 'Editor', navigation: { revision: 0 } }
const fileTab = { id: 'tab2', contentId: 'dsh-resource://file/session/s1/src/app.ts', title: 'app.ts', navigation: { revision: 3 } }
check(
  'blank page tab renders',
  renderToStaticMarkup(h(Body, { useTabInfo: () => ({ tab: blankTab }), sessionId: 's1', getModals: () => modals })).includes(
    'data-editor-tab="tab1"',
  ),
)
check(
  'file tab renders',
  renderToStaticMarkup(h(Body, { useTabInfo: () => ({ tab: fileTab }), sessionId: 's1', getModals: () => modals })).includes(
    'data-editor-tab="tab2"',
  ),
)

// ---------------------------------------------------------- dsh-open-in-app
const openInApp = loadBundle('packages/dsh-open-in-app/lib/client.js', {})
check('open-in-app bundle id', openInApp.id, 'dsh-open-in-app')
const oiaRegistered = {}
openInApp.exports.apply({
  get: () => undefined,
  slots: {
    inject: (name, fn) => fn(),
    register(spec, component) {
      oiaRegistered[spec.name] = { spec, component }
      return () => {}
    },
  },
  locale: { register: () => () => {} },
  effect: (fn) => fn(),
  logger: { debug() {}, warn() {} },
})
check('open-in-app slot', Object.keys(oiaRegistered).join(','), 'conversation.session.header.utilities')
const launch = oiaRegistered['conversation.session.header.utilities'].spec.inject().launch
const calls = []
globalThis.location = { origin: 'http://127.0.0.1:3099' }
globalThis.fetch = async (url, init) => {
  calls.push({ path: new URL(String(url)).pathname, body: init && init.body })
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}
await launch('vscode', 'C:/work')
await launch('explorer', 'C:/work')
await launch('gitbash', 'C:/work')
check(
  'file managers take the pack route',
  calls.map((call) => call.path).join(','),
  '/open-in-app/open,/api/dsh-open-in-app/open,/open-in-app/open',
)
check('launch bodies unchanged', calls[1].body, '{"app":"explorer","path":"C:/work"}')

console.log('')
console.log(failures === 0 ? 'all client-bundle checks passed' : failures + ' check(s) FAILED')
process.exitCode = failures === 0 ? 0 : 1
