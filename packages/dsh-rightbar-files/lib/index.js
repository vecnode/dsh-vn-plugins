/**
 * dsh-rightbar-files — Node half.
 *
 * The Files tab is browser-only: it registers a tab type into the right bar's
 * registry (dsh-rightbar) and lists the session workspace through the
 * `remote.workspaceFiles` namespace. The host tree gains nothing, so this row
 * exists only so the package's `dsh.client` declaration puts its browser bundle
 * in the boot graph — exactly like the shipped
 * `@deepseek-ai/dsh-client-ui-sidebar-files` row it replaces.
 */
export const name = 'dsh-rightbar-files'

/** Host plugin body: the Files tab contributes nothing to the host tree. */
export function apply() {}
