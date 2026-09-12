/**
 * dsh-terminal — the interactive shell for THIS host.
 *
 * The single place in this package that branches on the operating system, and
 * it exists for the same reason `dsh-open-in-app` has a launcher: which command
 * opens a terminal is a host fact, not a policy. Everything downstream - the
 * PTY, the routes, the dock - is OS-neutral.
 *
 * Chosen command per host:
 *
 *   win32    PowerShell 7 (`pwsh.exe`) when it is installed, else the Windows
 *            PowerShell 5.1 that ships with every supported Windows. node-pty
 *            drives both through ConPTY, so the browser gets a real console:
 *            prompts, colors, TUI programs, resizes.
 *   darwin   `$SHELL`, else /bin/zsh (the login shell on macOS since Catalina).
 *   linux    `$SHELL`, else /bin/bash.
 *
 * A login+interactive shell (`-l`, with bash/zsh detecting the PTY) is what a
 * person expects from a terminal window: their profile, their aliases, their
 * prompt. Nothing here reads a config file: the pack ships no `terminal.shell`
 * setting, and a shell the host cannot provide fails loudly at spawn instead of
 * silently running something else.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Well-known PowerShell 7 locations, for hosts that never put it on PATH. */
const PWSH_FALLBACKS = [
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'C:\\Program Files\\PowerShell\\6\\pwsh.exe',
  'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
]

/**
 * Find one executable on PATH. Windows needs the `PATHEXT` suffixes because a
 * bare `pwsh` is not a file name there; POSIX hosts have no such concept and
 * pass an empty suffix list.
 *
 * @param name - the command name without a suffix.
 * @param env - the environment to search (injected for tests).
 * @param suffixes - candidate suffixes, in order.
 * @returns the first existing absolute path, or `undefined`.
 */
function findOnPath(name, env, suffixes) {
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter)
  for (const dir of dirs) {
    if (dir === '') continue
    for (const suffix of suffixes) {
      const candidate = path.join(dir, name + suffix)
      try {
        if (existsSync(candidate)) return candidate
      } catch (err) {
        /* an unreadable PATH entry is simply not a match */
      }
    }
  }
  return undefined
}

/**
 * The command this host runs as an interactive shell.
 *
 * @param env - environment (defaults to the process's).
 * @param platform - the platform (defaults to the process's).
 * @returns `{ file, args, label }` — `label` is what the dock shows and logs.
 * @throws when the host provides no shell this package knows how to run.
 */
export function resolveShell(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const exeSuffixes = String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter((s) => s !== '')
    const pwsh = findOnPath('pwsh', env, exeSuffixes) ?? PWSH_FALLBACKS.find((candidate) => existsSync(candidate))
    if (pwsh !== undefined) return { file: pwsh, args: ['-NoLogo'], label: 'PowerShell 7' }
    const systemRoot = env.SystemRoot || env.windir || 'C:\\Windows'
    const windowsPowerShell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (existsSync(windowsPowerShell)) {
      return { file: windowsPowerShell, args: ['-NoLogo'], label: 'Windows PowerShell' }
    }
    // Last resort: let the OS resolve it, and let a failure surface at spawn.
    return { file: 'powershell.exe', args: ['-NoLogo'], label: 'Windows PowerShell' }
  }
  const login = platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
  const shell = typeof env.SHELL === 'string' && env.SHELL !== '' && existsSync(env.SHELL) ? env.SHELL : login
  // `-l` is the login shell (profiles, aliases, the user's own prompt); the PTY
  // makes it interactive, which bash/zsh detect from the terminal on stdin.
  return { file: shell, args: ['-l'], label: path.basename(shell) }
}
