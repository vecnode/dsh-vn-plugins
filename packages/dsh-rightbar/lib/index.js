/**
 * dsh-rightbar — Node half.
 *
 * The right bar is browser-only: it is a React surface registered into the
 * frame's `rightbar` seat plus the conversation header's corner seat, and it
 * provides the `sidebarRightTabs` / `sidebarRight` client services other tab
 * types (dsh-rightbar-files, dsh-editor) register into. The host tree gains
 * nothing, so this row exists only so the package's `dsh.client` declaration
 * puts its browser bundle in the boot graph — exactly like the shipped
 * `@deepseek-ai/dsh-client-ui-sidebar-right` row it replaces.
 */
export const name = 'dsh-rightbar'

/** Host plugin body: the right bar contributes nothing to the host tree. */
export function apply() {}
