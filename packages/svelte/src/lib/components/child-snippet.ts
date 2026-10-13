import type { Snippet } from 'svelte'

/** A `child` prop: render your own element, spread `props` on it. */
export type ChildSnippet = Snippet<[{ props: Record<string, unknown> }]>

/** `T` as Bits UI types its props: no `null` and no explicit `undefined` in a value type. */
export type BitsProps<T> = { [K in keyof T]: Exclude<T[K], null | undefined> }

/**
 * Svelte's attribute types allow `null` and `undefined` (`id?: string | null | undefined`)
 * where Bits UI's do not (`id?: string`, under exactOptionalPropertyTypes), so the host's rest
 * props do not type-check against a Bits UI component as they are. This takes both out of the
 * value types and nothing else, so the keys and the remaining value types are still checked
 * against the component. The values are passed through untouched: Bits UI hands them on to
 * the element, where a `null` or `undefined` attribute is left off. This is the one place the
 * cast lives.
 */
export function asBitsProps<T extends object>(rest: T): BitsProps<T> {
  return rest as BitsProps<T>
}
