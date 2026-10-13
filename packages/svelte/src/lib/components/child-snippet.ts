import type { Snippet } from 'svelte'

/** A `child` prop: render your own element, spread `props` on it. */
export type ChildSnippet = Snippet<[{ props: Record<string, unknown> }]>

/** `T` as Bits UI types its props: no `null` and no explicit `undefined` in a value type. */
export type BitsProps<T> = { [K in keyof T]: Exclude<T[K], null | undefined> }

/**
 * Svelte's attribute types allow `null` and `undefined` (`id?: string | null | undefined`)
 * where Bits UI's do not (`id?: string`, under exactOptionalPropertyTypes), so the host's rest
 * props do not type-check against a Bits UI component as they are. This takes both out of the
 * value types and nothing else, so the keys and the remaining value types are still checked.
 *
 * It is a cast at the type level only: nothing is dropped at runtime, and a key the host set
 * to `null` or `undefined` is passed on as that. For an attribute Bits UI hands through to the
 * element, Svelte leaves it off. A prop Bits UI reads itself (`id`, `disabled`, `orientation`,
 * `loop`) receives the explicit `null` or `undefined`. This is the one place the cast lives.
 */
export function asBitsProps<T extends object>(rest: T): BitsProps<T> {
  return rest as BitsProps<T>
}
