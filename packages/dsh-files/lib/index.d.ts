/**
 * dsh-files — browser half entry types (node half is JS-only today).
 */

export declare const name: 'dsh-files'

export interface ContextLike {
  logger?: { debug?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void }
  effect?(fn: () => () => void, label?: string): void
  get<T = unknown>(key: string): T | undefined
}

export declare function apply(ctx: ContextLike): void
