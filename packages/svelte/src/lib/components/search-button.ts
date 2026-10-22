import type { ChildSnippet } from './child-snippet.js'
import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

/** Props of `InkSearchButton`: a toolbar button that may render through `child`. */
export interface InkSearchButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
  children?: Snippet | undefined
  /** Render your own button: spread `props` on it. */
  child?: ChildSnippet | undefined
}
