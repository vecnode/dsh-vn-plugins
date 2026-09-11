# scripts/checks

Standalone verification for the pack's JavaScript halves. Neither script needs a
running harness and neither is part of the installers; run them after touching a
client bundle or a Node route (they caught a real "the tab body never got the
hook it needs" bug during the alpha.4 editor work). Node only - identical on
Windows, macOS and Linux.

```sh
node scripts/checks/check-client-bundles.mjs   # module table + real React render
node scripts/checks/check-node-routes.mjs      # editor routes + open-in-app route
DSH_CHECK_LAUNCH=1 node scripts/checks/check-node-routes.mjs   # also opens a real file browser
```

(Windows PowerShell: `$env:DSH_CHECK_LAUNCH='1'; node scripts/checks/check-node-routes.mjs`.)

- `check-client-bundles.mjs` loads `packages/dsh-modal/lib/client.js`,
  `packages/dsh-editor/lib/client.js`, `packages/dsh-themes/lib/client.js` and
  `packages/dsh-open-in-app/lib/client.js`
  exactly the way the shell does (through `window.__ModuleLoader__.load`),
  activates them against a stub cordis context, and drives them with a **real
  React runtime** found in the profile or an npx cache (`react-dom/server`, so
  browser-only hooks such as `useEffect` are skipped, like any server render).
  It asserts the `modals` service, the editor's tab type/`canOpen`/guide
  contract (Markdown claimed, **Preview** naming the registry's kind, and the
  fallback kind when the preview type is absent), the themes control's header
  seat (`order` left of Open In), its snapshot store, and the **Markdown paper**
  (the light declarations it copies out of fake theme stylesheets, and the dark
  ones it must skip), and the open-in-app route split (file managers to the pack
  route, everything else to the shipped one).
- `check-node-routes.mjs` imports the two Node halves, captures the handlers
  they register on the `connection` service, and drives them with real
  `Request`s against a temp workspace: containment, create-only semantics,
  optimistic concurrency, and the launcher's wire validation.
