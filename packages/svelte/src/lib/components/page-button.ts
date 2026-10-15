import type { ChildSnippet } from './child-snippet.js'
import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

/** Props of `InkPrevPage` and `InkNextPage`: a toolbar button that may render through `child`. */
export interface InkPageButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
  children?: Snippet | undefined
  /** Render your own button: spread `props` on it. */
  child?: ChildSnippet | undefined
}
