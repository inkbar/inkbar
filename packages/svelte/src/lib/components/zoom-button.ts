import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

/** Props of `InkZoomIn` and `InkZoomOut`: a toolbar button that may render through `child`. */
export interface InkZoomButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
  children?: Snippet | undefined
  /** Render your own button: spread `props` on it. */
  child?: Snippet<[{ props: Record<string, unknown> }]> | undefined
}
