/**
 * dsh-terminal — the PTY half: resolve node-pty, then own the live sessions.
 *
 * ## Why the harness's own node-pty
 *
 * A browser xterm needs a REAL pty: prompts, colors, TUI programs and resizes.
 * Pipes are not a substitute (a piped PowerShell is not a REPL), and the core
 * `ctx.terminals` service is the wrong tool - it is owner-scoped to an Agent and
 * line-oriented (`spawn`/`send`/`read`), with no raw byte stream.
 *
 * The harness already ships `node-pty` (with prebuilds for win32-x64/arm64
 * ConPTY, darwin-x64/arm64 and linux-x64/arm64) as part of its own installation
 * closure, so this package installs nothing and builds nothing. What it does
 * have to do is FIND it: an out-of-tree plugin's own path is this repository,
 * and Node resolves bare specifiers by walking up from the importing FILE, so a
 * plain `import('node-pty')` from here fails. Both anchors below are places the
 * harness itself keeps its dependency closure, and both were verified to
 * resolve the npx-cache copy of node-pty:
 *
 *   1. `process.argv[1]` - the running entry (`.../node_modules/@deepseek-ai/
 *      dsh/lib/bin.js` under npx, the same shape in a global install), whose
 *      parent walk lands in that installation's `node_modules`;
 *   2. `$DSH_HOME/profiles` - `@deepseek-ai/dsh-app-boot` mirrors the whole
 *      installation closure into `$DSH_HOME/profiles/node_modules` so
 *      out-of-tree plugins can reach it through Node's ordinary parent walk;
 *   3. this package's own directory - so a future line where node-pty is a
 *      declared dependency beside this package works unchanged.
 *
 * Resolution failure is NOT fatal: the row stays mounted, the dock says the PTY
 * is unavailable, and the boot is untouched. node-pty is a harness internal
 * rather than a published API, so the degrade path matters as much as the happy
 * one.
 *
 * ## Sessions
 *
 * One PTY per (conversation, index) - the client names the slot, the server
 * keeps it. Output is kept in a bounded scrollback ring so a reload or a
 * remount replays what the shell already printed, and a session whose last
 * socket goes away is kept for a grace period (an F5 must not kill the shell)
 * and then reaped. Every timer here is `unref`ed: a terminal can never keep the
 * harness process alive.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

/** Most output retained per session for a reattach replay. */
const SCROLLBACK_BYTES = 256 * 1024
/** How long a session with no attached socket survives before it is reaped. */
const DETACH_GRACE_MS = 5 * 60 * 1000
/** How long an exited session is kept so a reattach can show its exit. */
const EXITED_GRACE_MS = 60 * 1000
/** Reaper cadence. */
const REAP_INTERVAL_MS = 30 * 1000
/** Most concurrent PTYs one conversation may hold. */
const MAX_SESSIONS_PER_CONVERSATION = 8
/** Terminal geometry bounds: a client cannot ask for an absurd buffer. */
const MIN_COLS = 2
const MAX_COLS = 1000
const MIN_ROWS = 1
const MAX_ROWS = 500

/**
 * Where to look for node-pty, most-specific first. Duplicates are dropped by
 * the caller; a missing anchor is simply skipped.
 *
 * @returns absolute file paths to resolve FROM (never directories).
 */
export function ptyResolutionAnchors() {
  const anchors = []
  const entry = process.argv[1]
  if (typeof entry === 'string' && entry !== '') anchors.push(entry)
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  anchors.push(path.join(home, 'profiles', 'index.js'))
  anchors.push(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'))
  return anchors
}

/**
 * Resolve and load the harness's node-pty.
 *
 * @param logger - optional cordis logger (`warn`/`debug` are used).
 * @returns `{ pty, resolved }` on success, `{ error }` when this host cannot
 *   provide one - the caller degrades instead of failing.
 */
export function loadNodePty(logger) {
  const tried = []
  const seen = new Set()
  for (const anchor of ptyResolutionAnchors()) {
    if (typeof anchor !== 'string' || anchor === '' || seen.has(anchor)) continue
    seen.add(anchor)
    // The anchor file itself need not exist: `createRequire` uses its DIRECTORY
    // for the parent walk, which is the whole point for `$DSH_HOME/profiles`
    // (a directory that holds only `node_modules`).
    try {
      const resolved = createRequire(anchor).resolve('node-pty')
      const pty = createRequire(anchor)('node-pty')
      if (pty && typeof pty.spawn === 'function') return { pty, resolved }
      tried.push(anchor + ' (no spawn export)')
    } catch (err) {
      tried.push(anchor + ' (' + (err && err.code ? err.code : String(err)) + ')')
    }
  }
  const message =
    'node-pty is not resolvable from this harness installation; the terminal dock will report the PTY as unavailable.'
  if (logger && typeof logger.warn === 'function') logger.warn('[dsh-terminal] ' + message + ' Tried: ' + tried.join(', '))
  return { error: message, tried }
}

/** Clamp a client-supplied terminal size into a sane window. */
export function clampSize(cols, rows) {
  const c = Number.isFinite(cols) ? Math.round(cols) : 80
  const r = Number.isFinite(rows) ? Math.round(rows) : 24
  return {
    cols: Math.min(Math.max(c, MIN_COLS), MAX_COLS),
    rows: Math.min(Math.max(r, MIN_ROWS), MAX_ROWS),
  }
}

/** One live (or recently exited) PTY. */
class Session {
  constructor(key, sessionId, pty, facts) {
    this.key = key
    this.sessionId = sessionId
    this.pty = pty
    this.facts = facts
    this.chunks = []
    this.bytes = 0
    this.listeners = new Set()
    this.attached = 0
    this.detachedAt = null
    this.exit = null
    this.exitedAt = null
  }

  /** Append output to the ring, trimming the oldest whole chunks. */
  push(text) {
    if (text === '') return
    this.chunks.push(text)
    this.bytes += Buffer.byteLength(text)
    while (this.bytes > SCROLLBACK_BYTES && this.chunks.length > 1) {
      const dropped = this.chunks.shift()
      this.bytes -= Buffer.byteLength(dropped)
    }
    // A single chunk larger than the whole ring is kept trimmed to its tail.
    if (this.bytes > SCROLLBACK_BYTES && this.chunks.length === 1) {
      const only = this.chunks[0]
      const trimmed = only.slice(Math.max(0, only.length - SCROLLBACK_BYTES))
      this.chunks = [trimmed]
      this.bytes = Buffer.byteLength(trimmed)
    }
  }

  replay() {
    return this.chunks.join('')
  }
}

/**
 * The session registry: create, attach, drive, detach and reap PTYs.
 *
 * Deliberately NOT a cordis service: nothing outside this package consumes it,
 * and the pack publishes a service only when a consumer exists (`modals`,
 * `sidebarRightTabs`). It is owned and disposed by the row.
 */
export class PtyHost {
  /**
   * @param options - `pty` (the loaded node-pty), `shell` (from resolveShell),
   *   `logger`, and optional overrides for the retention constants.
   */
  constructor({ pty, shell, logger, scrollbackBytes = SCROLLBACK_BYTES, graceMs = DETACH_GRACE_MS, maxSessions = MAX_SESSIONS_PER_CONVERSATION }) {
    this.pty = pty
    this.shell = shell
    this.logger = logger
    this.scrollbackBytes = scrollbackBytes
    this.graceMs = graceMs
    this.maxSessions = maxSessions
    this.sessions = new Map()
    this.nextIndex = new Map()
    this.disposed = false
    this.timer = setInterval(() => this.reap(), REAP_INTERVAL_MS)
    // Never hold the harness process open for a terminal's reaper.
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  /** Sessions of one conversation, newest last. */
  forConversation(sessionId) {
    return [...this.sessions.values()].filter((session) => session.sessionId === sessionId)
  }

  /**
   * The next free slot index for a conversation. The client names slots, so a
   * reattaching client asks for the same key and gets the same shell back.
   */
  nextSlot(sessionId) {
    const used = new Set(this.forConversation(sessionId).map((session) => session.key))
    let index = 0
    while (used.has(sessionId + '#' + String(index))) index += 1
    return index
  }

  /** A client-facing snapshot of one session (never the pty handle itself). */
  snapshot(session) {
    // node-pty's Windows agent reports pid 0 until ConPTY has attached, so a
    // ready frame sent immediately after spawn would otherwise carry a bogus 0.
    const pid = typeof session.pty.pid === 'number' && session.pty.pid > 0 ? session.pty.pid : null
    return {
      key: session.key,
      index: Number(session.key.slice(session.key.lastIndexOf('#') + 1)),
      shell: session.facts.label,
      cwd: session.facts.cwd,
      pid,
      cols: session.facts.cols,
      rows: session.facts.rows,
      attached: session.attached,
      exited: session.exit,
    }
  }

  /**
   * Create a PTY for one slot, or return the live one already there.
   *
   * @param options - `sessionId`, `slot` (or undefined for the next free one),
   *   `cwd`, `cols`, `rows`.
   * @returns the session record.
   * @throws a typed error (`{ status, code, message }`) the route can answer.
   */
  ensure({ sessionId, slot, cwd, cols, rows }) {
    if (this.disposed) throw ptyError(503, 'DISPOSING', 'The terminal service is shutting down.')
    const index = Number.isInteger(slot) && slot >= 0 ? slot : this.nextSlot(sessionId)
    const key = sessionId + '#' + String(index)
    const existing = this.sessions.get(key)
    if (existing !== undefined && existing.exit === null) return existing
    if (existing !== undefined) this.sessions.delete(key)
    if (this.forConversation(sessionId).length >= this.maxSessions) {
      throw ptyError(409, 'TOO_MANY', 'This conversation already has ' + String(this.maxSessions) + ' terminals.')
    }
    const size = clampSize(cols, rows)
    let child
    try {
      child = this.pty.spawn(this.shell.file, this.shell.args, {
        name: 'xterm-256color',
        cols: size.cols,
        rows: size.rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // A shell started by the GUI should not advertise itself as one.
          DSH_TERMINAL: '1',
        },
      })
    } catch (err) {
      throw ptyError(500, 'SPAWN_FAILED', 'Could not start ' + this.shell.label + ': ' + String((err && err.message) || err), err)
    }
    const facts = { cwd, cols: size.cols, rows: size.rows, label: this.shell.label }
    const session = new Session(key, sessionId, child, facts)
    this.sessions.set(key, session)
    const onData = child.onData((text) => {
      session.push(text)
      for (const listener of session.listeners) {
        try {
          listener({ type: 'data', data: text })
        } catch (err) {
          /* one bad listener never stops the pty */
        }
      }
    })
    const onExit = child.onExit(({ exitCode, signal }) => {
      session.exit = { code: exitCode, signal: signal === undefined ? null : signal }
      session.exitedAt = Date.now()
      for (const listener of session.listeners) {
        try {
          listener({ type: 'exit', exit: session.exit })
        } catch (err) {
          /* as above */
        }
      }
      if (typeof onData.dispose === 'function') onData.dispose()
      if (typeof onExit.dispose === 'function') onExit.dispose()
    })
    this.logger?.debug?.('[dsh-terminal] spawned ' + this.shell.label + ' pid ' + String(child.pid) + ' in ' + cwd)
    return session
  }

  /** Subscribe to one session's output and exit; returns the unsubscriber. */
  subscribe(session, listener) {
    session.listeners.add(listener)
    session.attached += 1
    session.detachedAt = null
    let done = false
    return () => {
      if (done) return
      done = true
      session.listeners.delete(listener)
      session.attached = Math.max(0, session.attached - 1)
      if (session.attached === 0) session.detachedAt = Date.now()
    }
  }

  /** Write keystrokes (or a paste) to the shell. */
  write(session, data) {
    if (session.exit !== null) return
    session.pty.write(data)
  }

  /** Apply a resize from the browser. */
  resize(session, cols, rows) {
    if (session.exit !== null) return
    const size = clampSize(cols, rows)
    if (size.cols === session.facts.cols && size.rows === session.facts.rows) return
    session.facts.cols = size.cols
    session.facts.rows = size.rows
    try {
      session.pty.resize(size.cols, size.rows)
    } catch (err) {
      this.logger?.debug?.('[dsh-terminal] resize failed: ' + String((err && err.message) || err))
    }
  }

  /** Pause/resume the pty for socket backpressure. */
  flow(session, paused) {
    try {
      if (paused) session.pty.pause()
      else session.pty.resume()
    } catch (err) {
      /* a pty that cannot pause simply keeps buffering */
    }
  }

  /** End one session and forget it. */
  kill(session, reason) {
    if (this.sessions.get(session.key) !== session) return false
    this.sessions.delete(session.key)
    try {
      session.pty.kill()
    } catch (err) {
      this.logger?.debug?.('[dsh-terminal] kill failed: ' + String((err && err.message) || err))
    }
    for (const listener of session.listeners) {
      try {
        listener({ type: 'closed', reason })
      } catch (err) {
        /* as above */
      }
    }
    session.listeners.clear()
    return true
  }

  /** Reap detached and exited sessions. */
  reap(now = Date.now()) {
    for (const session of [...this.sessions.values()]) {
      if (session.exit !== null) {
        const since = session.exitedAt === null ? 0 : now - session.exitedAt
        if (since > EXITED_GRACE_MS && session.attached === 0) this.kill(session, 'exited')
        continue
      }
      if (session.attached === 0 && session.detachedAt !== null && now - session.detachedAt > this.graceMs) {
        this.kill(session, 'detached')
      }
    }
  }

  /** Close everything (row disposal). */
  dispose() {
    this.disposed = true
    clearInterval(this.timer)
    for (const session of [...this.sessions.values()]) this.kill(session, 'disposed')
    this.sessions.clear()
  }
}

/** A typed failure the routes translate into a status code and a body. */
export function ptyError(status, code, message, cause) {
  const err = new Error(message)
  err.status = status
  err.code = code
  if (cause) err.cause = cause
  return err
}
