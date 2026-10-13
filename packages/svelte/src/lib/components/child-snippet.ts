import type { Snippet } from 'svelte'

/** A `child` prop: render your own element, spread `props` on it. */
export type ChildSnippet = Snippet<[{ props: Record<string, unknown> }]>

/**
 * Bits UI types its attributes without `| null | undefined` (exactOptionalPropertyTypes), so
 * the host's `HTMLAttributes` rest props do not type-check against them. The values are
 * passed through untouched; this is the one place the cast lives.
 */
export function asBitsProps(rest: object): Record<string, unknown> {
  return rest as Record<string, unknown>
}
