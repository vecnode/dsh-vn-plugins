/**
 * dsh-themes - Node half.
 *
 * The Themes control is browser-only: its client half registers one small
 * button into the Session header's utilities slot and writes the theme
 * preference through the `theme` service that
 * `@deepseek-ai/dsh-client-ui-theme` provides. The host tree gains nothing, so
 * this row exists only so the package's `dsh.client` declaration puts its
 * browser bundle in the boot graph - the same shape as the shipped
 * `@deepseek-ai/dsh-client-ui-theme` row the control drives.
 */
export const name = 'dsh-themes'

/** Host plugin body: the Themes control contributes nothing to the host tree. */
export function apply() {}
