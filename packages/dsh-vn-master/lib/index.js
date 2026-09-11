/**
 * dsh-vn-master — Node half.
 *
 * The master is browser-free by design: it owns no host behavior and no client
 * surface, so that it can carry pack-wide layers without ever entering the
 * right bar's tab-type chain (no `dsh.client` declaration, no `inject` edge).
 * This row exists so the bundle layer has a row to insert — every shipped row
 * resolves its host plugin by package name — and so the master is visible in
 * the composition for what it is: the pack's base layer.
 */
export const name = 'dsh-vn-master'

/** Host plugin body: the master contributes nothing to the host tree. */
export function apply() {}
