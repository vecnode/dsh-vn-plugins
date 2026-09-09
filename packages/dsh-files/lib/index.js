/**
 * dsh-files — Node half.
 *
 * The Files panel is a browser plugin: it renders inside the Web GUI and reads
 * everything it needs (session list, session cwd, folder listings) through
 * supported client services and Remotes that ship with the web composition
 * (sessions + session file references, the same service the `@` file menu
 * uses). This Node row exists so the Loader carries the entry and the package's
 * `dsh.client` bundle is served to the browser.
 *
 * Deliberately tiny — no server-side filesystem access, no custom Remotes, so
 * the plugin keeps working when DeepSeek Harness evolves its API surface.
 */

export const name = 'dsh-files'

/**
 * Activate the plugin row.
 * @param ctx - cordis context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    ctx.logger?.debug?.('[dsh-files] node half active (alpha)')
    return () => {
      ctx.logger?.debug?.('[dsh-files] node half disposed')
    }
  }, 'dsh-files: node half')
}
