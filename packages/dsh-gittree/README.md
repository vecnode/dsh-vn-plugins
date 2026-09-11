# dsh-gittree (alpha.1)

**GitTree** is a **tab type for the pack's right bar** (`dsh-rightbar` — the
right-hand column of the DeepSeek Harness web GUI, beside the shipped **Start**
page and the **Files** tab, and the pack's **Editor**). It shows the git tree of
the tab's own conversation folder — every tracked file plus the changed and
untracked ones, each with a status badge — and the **History** of that folder.
Clicking a file opens it through the ordinary file address, so the editor (or a
shipped preview) claims it. Alpha.

**It is read-only.** Nothing in this package can stage, commit, check out, fetch
or write a config value: the only git subcommands it can reach are `rev-parse`,
`status`, `ls-files`, `log`, `show` and `diff-tree`.

## How it plugs in

It is a **page type**, exactly like the Editor's page tab: it declares no
`patterns`, so it never competes for a file address.

| Piece | Value |
|---|---|
| `id` / slot key | `dsh-gittree` |
| `kind` / address | `gittree` / `sidebar://gittree` |
| `priority` | `builtin` |
| guide entry | **GitTree**, `order: 30` — after Files (10) and Editor (20) |
| seats | the keyed `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title` |
| services | `slots` + the bar's `sidebarRightTabs` (nothing else) |

The tab strip's **"+"** opens the Start page, which lists the guide entries;
picking **GitTree** creates (or reveals) the page tab.

A **file row click** calls the tab record's own `openResource` action with a
`dsh-resource://file/session/<sessionId>/<path>` address and **no options** — the
identical call the Files tab makes — so the registry's ranking decides what
claims the file: the pack's editor for text, a shipped preview for an image or a
PDF. The GitTree tab stays open beside it, and this package needs neither the
editor nor any preview to exist.

## The two views

- **Tree** — the workspace's files. Directories start collapsed (the root level is
  the first impression); each row carries a letter badge: `M` modified, `A`
  added, `D` deleted, `R` renamed, `?` untracked, `U` unmerged — coloured with
  the app's own state tokens, with the staged/worktree detail in the tooltip. A
  directory row counts its changed files. The toolbar has a path **filter** and a
  **Changed** switch (both auto-expand folders, so a hit is never hidden inside a
  closed one).
- **History** — the commit log (`short sha`, subject, author, date). Clicking a
  commit opens it in place: its full id, author, date, message body and the files
  it touched, each openable like a tree row. The repository's **first** commit
  lists its files too (the route passes `--root`, which `diff-tree` needs).

The file bar shows the branch (or `(detached)`), the short HEAD, `↑ahead`/`↓behind`
when there is an upstream, `n changed · m files`, and the **version marker**
(`dsh-gittree 0.1.0-alpha.1`) that makes a freshly loaded bundle easy to verify.

## The read-only routes (Node half)

The browser cannot read a repository, so the row owns three authenticated
`connection.fetch` routes under `/api/dsh-gittree/*` — the same mechanism
`dsh-editor` uses:

| Route | Git behind it | Answers |
|---|---|---|
| `GET /api/dsh-gittree/state?session=<id>` | `rev-parse --show-toplevel`, `status --porcelain=v2 -z --untracked-files=all --branch`, `ls-files -z`, `rev-parse --short HEAD` | `{ root, repoRoot, scope, branch, head, detached, upstream, ahead, behind, entries, total, changed, truncated }` |
| `GET /api/dsh-gittree/history?session=<id>&limit=N` | `log -n N --date=short --pretty=format:…` (scoped to the workspace when it is a subfolder) | `{ commits: [{ sha, short, author, date, subject }] }` |
| `GET /api/dsh-gittree/commit?session=<id>&sha=<id>` | `show -s --pretty=format:…` + `diff-tree --root --no-commit-id --name-status -r -z` | `{ commit: { sha, short, author, email, date, subject, body }, files: [{ status, path, origPath? }] }` |

`entries[].status` is git's own `XY` pair (empty string for a clean tracked
file), so the client never guesses: the badge is the first set side, and the
tooltip says which side it was.

Design points worth keeping:

- **The session id is the only input.** The workspace root is resolved host-side —
  live session header first, session persistence second, a typed `NO_WORKSPACE`
  otherwise — exactly like `dsh-editor`. The client never names a path on disk.
- **Scope.** When the conversation folder sits *inside* a repository (a monorepo
  package, a session opened on a subdirectory), the tree and the history are
  scoped to that folder and every path is reported workspace-relative, so a row
  click can be handed straight to the file-address grammar. Both sides of that
  comparison go through `realpath` — a session header can carry a Windows 8.3
  short path (`LUISAR~1`) or a symlinked path, and a relative path computed across
  two spellings of the same folder is garbage.
- **Parsed, not string-matched.** `status --porcelain=v2 -z` is walked as
  NUL-separated tokens (a rename's source path is the *next* token; paths may
  contain spaces), and `diff-tree -z` yields `STATUS\0path\0` pairs.
- **No shell, no injection, no holes.** git is spawned with an argv array and no
  shell; every argument is a literal in `lib/index.js` plus, at most, a commit id
  that must match `/^[0-9a-fA-F]{4,40}$/` before it can reach argv — so `--all`
  or any other option is rejected as `BAD_REQUEST`. The environment is pinned
  (`GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `--no-pager`), the
  call is killed after 10 s and its output capped at 8 MiB, and a failure is
  typed (`NOT_A_REPO`, `GIT_MISSING`, `TIMEOUT`, `TOO_LARGE`, `GIT_FAILED`) so the
  surface can say *why* instead of "failed".
- **Lazy.** Nothing runs until the tab is shown, and the History request waits for
  the History view. The route responses are `no-store`.

## Layout

```
cordis.patch.yml   bundle layer: inserts the 'gittree' row (nothing else patched)
lib/index.js       Node half: the read-only /api/dsh-gittree routes above
lib/client.js      Browser half: the page tab type + guide entry, the tree and
                   history views, and the status badges (module-table bundle,
                   no build step)
```

Nothing is forked and no core row is disabled: this package **adds** surface, so
`scripts/sync-vendored.ps1` has nothing to keep in sync for it.

## Verification

`scripts/checks/check-node-routes.mjs` drives these routes against a **real
scratch repository** it creates (init → commit → modify → untracked → a workspace
that is a subfolder), asserting the scope, the status codes, the root commit's
file list and the option-injection guard;
`scripts/checks/check-client-bundles.mjs` loads the browser half through the
module table and a real React runtime and checks the registration, the guide
order, both views and the chip title.

## Install / uninstall

The repo launcher (`install.bat` on Windows, `./install.sh` on macOS/Linux)
auto-discovers this package — it is a standard `dsh.bundle`. Adding a package
changes the profile's bundle set, so the first install after it appeared needs
one plain launcher run (or `-Force`). The web profile links it into this repo, so
code edits only need a restart of `npx @deepseek-ai/dsh web` plus a hard browser
refresh. **git must be on `PATH`** for the routes to answer; without it the tab
says so (`GIT_MISSING`) instead of failing silently.
