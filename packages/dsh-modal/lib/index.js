/**
 * dsh-modal — Node half.
 *
 * The dialog surface is browser-only: its client half renders a body-level
 * overlay (React, portaled with `react-dom/client`) and provides the `modals`
 * service other browser plugins resolve through `ctx.get('modals')`. The host
 * tree gains nothing, so this row exists only so the package's `dsh.client`
 * declaration puts its browser bundle in the boot graph — exactly like the
 * shipped `@deepseek-ai/dsh-client-ui-sidebar-right` row dsh-rightbar replaces.
 */
export const name = 'dsh-modal'

/** Host plugin body: the shared dialog surface contributes nothing to the host tree. */
export function apply() {}
