// check-node-routes.mjs - drive the pack's host-side route handlers directly,
// with real Requests and a real temp workspace.
//
// Why this exists: the two Node halves register their handlers through
// `connection.fetch.register`, so importing the module and capturing that
// handler exercises the shipped code path (path resolution, containment,
// optimistic concurrency, create-only semantics, wire validation) without a
// running harness.
//
// Run:  node scripts/checks/check-node-routes.mjs
export {} // (kept import-free: this file is ESM for the dynamic import below)

const { promises: fsp } = await import('node:fs')
const os = await import('node:os')
const path = (await import('node:path')).default
const { pathToFileURL, fileURLToPath } = await import('node:url')
const { spawnSync } = await import('node:child_process')

const repo = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
let failures = 0
function check(label, actual, expected) {
  const ok = expected === undefined ? Boolean(actual) : actual === expected
  if (!ok) failures += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label.padEnd(34) + (expected === undefined ? '' : ' ' + JSON.stringify(actual)))
  return ok
}

/** Register one row against a stub context and hand back its route handler. */
async function capture(modulePath, routePath, ctx) {
  const module = await import(pathToFileURL(modulePath).href)
  let handler = null
  const context = {
    ...ctx,
    effect: (fn) => fn(),
    logger: { debug() {}, warn() {} },
    get(name) {
      if (name === 'connection') {
        return {
          fetch: {
            register(route) {
              if (route.path === routePath) handler = route.fetch
              return () => {}
            },
          },
        }
      }
      return ctx.get ? ctx.get(name) : undefined
    },
  }
  module.apply(context)
  if (typeof handler !== 'function') throw new Error('route not registered: ' + routePath)
  return handler
}

// ------------------------------------------------------------- dsh-editor
const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-editor-check-'))
const sessionId = 'session-check'
const fileHandler = await capture(path.join(repo, 'packages/dsh-editor/lib/index.js'), '/api/dsh-editor/file', {
  get: (name) => (name === 'sessions' ? { get: (id) => (id === sessionId ? { header: { cwd: root } } : undefined) } : undefined),
})
const put = (body) =>
  fileHandler(
    new Request('http://x/api/dsh-editor/file', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
const get = (query) => fileHandler(new Request('http://x/api/dsh-editor/file?' + query, { method: 'GET' }))
const code = async (response) => {
  const payload = await response.json().catch(() => null)
  return payload && payload.error ? payload.error.code : payload && payload.ok ? 'ok' : 'http ' + response.status
}

check('create needs an existing folder', await code(await put({ session: sessionId, path: 'notes/a.md', text: '# a\n', create: true })), 'NO_FOLDER')
await fsp.mkdir(path.join(root, 'notes'))
check('create', await code(await put({ session: sessionId, path: 'notes/a.md', text: '# a\n', create: true })), 'ok')
check('created on disk', await fsp.readFile(path.join(root, 'notes', 'a.md'), 'utf8'), '# a\n')
check('create never overwrites', await code(await put({ session: sessionId, path: 'notes/a.md', text: 'x', create: true })), 'EXISTS')
for (const bad of ['../out.txt', 'a/../../b.txt', '/abs.txt', 'C:/abs.txt', 'notes/', '.', 'notes/..']) {
  check('rejects ' + JSON.stringify(bad), await code(await put({ session: sessionId, path: bad, text: 'x', create: true })), 'BAD_REQUEST')
}
check(
  'nothing escaped the workspace',
  await fsp
    .stat(path.join(root, '..', 'out.txt'))
    .then(() => 'exists')
    .catch(() => 'absent'),
  'absent',
)
check('read back', await fsp.readFile(path.join(root, 'notes', 'a.md'), 'utf8'), '# a\n')
const reader = await get('session=' + sessionId + '&path=notes/a.md')
check('GET route answers', reader.status, 200)
check('save of an unknown file', await code(await put({ session: sessionId, path: 'notes/b.md', text: 'x' })), 'NOT_FOUND')
const before = await fsp.stat(path.join(root, 'notes', 'a.md'))
check(
  'save in place',
  await code(await put({ session: sessionId, path: 'notes/a.md', text: '# a2\n', expected: { mtimeMs: before.mtimeMs, size: before.size } })),
  'ok',
)
check(
  'stale save is refused',
  await code(await put({ session: sessionId, path: 'notes/a.md', text: 'z', expected: { mtimeMs: before.mtimeMs, size: before.size } })),
  'CHANGED_ON_DISK',
)
check('unknown session', await code(await put({ session: 'nope', path: 'x.txt', text: 'x', create: true })), 'NO_WORKSPACE')
await fsp.rm(root, { recursive: true, force: true })

// -------------------------------------------------------- dsh-open-in-app
const openHandler = await capture(path.join(repo, 'packages/dsh-open-in-app/lib/index.js'), '/api/dsh-open-in-app/open', {})
const open = (body) =>
  openHandler(
    new Request('http://x/api/dsh-open-in-app/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
const openCode = async (response) => {
  const payload = await response.json().catch(() => null)
  return payload && payload.error ? payload.error.code : payload && payload.ok ? 'ok' : 'http ' + response.status
}
const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-open-check-'))
check('only file managers are accepted', await code(await open({ app: 'vscode', path: dir })), 'BAD_REQUEST')
check('the path must be absolute', await code(await open({ app: 'explorer', path: 'relative/dir' })), 'BAD_REQUEST')
check('the directory must exist', await code(await open({ app: 'explorer', path: path.join(dir, 'nope') })), 'NOT_FOUND')
check('the body must be JSON', await code(await open('not json')), 'BAD_REQUEST')
// The happy path SPAWNS the real file browser (an Explorer/Finder window), so it
// is opt-in: DSH_CHECK_LAUNCH=1 node scripts/checks/check-node-routes.mjs
if (process.env.DSH_CHECK_LAUNCH === '1') {
  const launched = await open({ app: 'explorer', path: dir })
  check('a valid request launches', launched.status, 200)
  // Give the file browser a moment to open the folder before it disappears.
  await new Promise((resolve) => setTimeout(resolve, 1500))
} else {
  console.log('skip a valid request launches       (set DSH_CHECK_LAUNCH=1 to open a file browser)')
}
await fsp.rm(dir, { recursive: true, force: true })

// ------------------------------------------------------------- dsh-gittree
// The git routes are driven against a REAL scratch repository (init, commit,
// rename, untracked file, plus a workspace that is a subfolder of it), because
// the wire formats they parse - `status --porcelain=v2 -z` and
// `diff-tree --name-status -z` - are exactly the contract under test.
const hasGit = (() => {
  try {
    return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
  } catch (err) {
    return false
  }
})()
if (!hasGit) {
  console.log('skip dsh-gittree routes             (git is not on PATH)')
} else {
  const gitRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-gittree-check-'))
  const gitModule = path.join(repo, 'packages/dsh-gittree/lib/index.js')
  const stateRoute = '/api/dsh-gittree/state'
  const historyRoute = '/api/dsh-gittree/history'
  const commitRoute = '/api/dsh-gittree/commit'
  const sessionFor = (cwd) => ({
    get: (name) => (name === 'sessions' ? { get: (id) => (id === 'session-git' ? { header: { cwd } } : undefined) } : undefined),
  })
  const stateHandler = await capture(gitModule, stateRoute, sessionFor(gitRoot))
  const historyHandler = await capture(gitModule, historyRoute, sessionFor(gitRoot))
  const commitHandler = await capture(gitModule, commitRoute, sessionFor(gitRoot))
  const ask = async (handler, route, query) => {
    const response = await handler(new Request('http://x' + route + (query === '' ? '' : '?' + query), { method: 'GET' }))
    return { status: response.status, payload: await response.json().catch(() => null) }
  }
  const outcome = async (handler, route, query) => {
    const answer = await ask(handler, route, query)
    return answer.payload && answer.payload.error ? answer.payload.error.code : answer.payload && answer.payload.ok ? 'ok' : 'http ' + answer.status
  }
  const git = (args) => {
    const result = spawnSync('git', ['-C', gitRoot, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0' } })
    if (result.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + String(result.stderr || '').trim())
    return result.stdout
  }
  const session = 'session-git'
  check('gittree: not a repo yet', await outcome(stateHandler, stateRoute, 'session=' + session), 'NOT_A_REPO')
  check('gittree: unknown session', await outcome(stateHandler, stateRoute, 'session=nope'), 'NO_WORKSPACE')
  check('gittree: a session is required', await outcome(stateHandler, stateRoute, ''), 'BAD_REQUEST')
  git(['init', '-q', '.'])
  git(['config', 'user.email', 'check@example.invalid'])
  git(['config', 'user.name', 'check'])
  await fsp.writeFile(path.join(gitRoot, 'readme.md'), '# one\n')
  await fsp.mkdir(path.join(gitRoot, 'sub'))
  await fsp.writeFile(path.join(gitRoot, 'sub', 'inner.txt'), 'inner\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'first commit'])
  await fsp.writeFile(path.join(gitRoot, 'sub', 'inner.txt'), 'inner changed\n')
  await fsp.writeFile(path.join(gitRoot, 'new file.txt'), 'untracked\n')
  const state = await ask(stateHandler, stateRoute, 'session=' + session)
  const entries = state.payload && Array.isArray(state.payload.entries) ? state.payload.entries : []
  const byPath = Object.fromEntries(entries.map((entry) => [entry.path, entry.status]))
  check('gittree: state answers', state.status, 200)
  check('gittree: names the branch', typeof state.payload.branch === 'string' && state.payload.branch.length > 0)
  check('gittree: names the head', typeof state.payload.head === 'string' && state.payload.head.length > 0)
  check('gittree: a clean tracked file has no status', byPath['readme.md'], '')
  check('gittree: a modified file is marked', (byPath['sub/inner.txt'] || '').indexOf('M') >= 0)
  check('gittree: an untracked file is marked', byPath['new file.txt'], '??')
  check('gittree: counts the changed files', state.payload.changed >= 2)
  const history = await ask(historyHandler, historyRoute, 'session=' + session + '&limit=5')
  const commits = history.payload && Array.isArray(history.payload.commits) ? history.payload.commits : []
  check('gittree: history answers', history.status, 200)
  check('gittree: one commit, with its subject', commits.length === 1 && commits[0].subject, 'first commit')
  const detail = await ask(commitHandler, commitRoute, 'session=' + session + '&sha=' + commits[0].sha)
  const files = detail.payload && Array.isArray(detail.payload.files) ? detail.payload.files : []
  check(
    'gittree: the root commit lists its files',
    files.map((file) => file.status + ':' + file.path).sort().join(','),
    'A:readme.md,A:sub/inner.txt',
  )
  // A commit id is never allowed to reach argv as an option.
  check('gittree: a commit needs a valid id', await outcome(commitHandler, commitRoute, 'session=' + session + '&sha=--all'), 'BAD_REQUEST')
  // A workspace that is a SUBFOLDER of the repository: the tree is scoped to it
  // and every path stays workspace-relative.
  const subHandler = await capture(gitModule, stateRoute, {
    get: (name) =>
      name === 'sessions'
        ? { get: (id) => (id === 'session-git' ? { header: { cwd: path.join(gitRoot, 'sub') } } : undefined) }
        : undefined,
  })
  const subState = await ask(subHandler, stateRoute, 'session=' + session)
  const subPaths = (subState.payload && Array.isArray(subState.payload.entries) ? subState.payload.entries : []).map((entry) => entry.path).sort().join(',')
  check('gittree: a subfolder workspace is scoped', subPaths, 'inner.txt')
  await fsp.rm(gitRoot, { recursive: true, force: true })
}

console.log('')
console.log(failures === 0 ? 'all node-route checks passed' : failures + ' check(s) FAILED')
process.exitCode = failures === 0 ? 0 : 1
