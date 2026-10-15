import type { ChildSnippet } from './child-snippet.js'
import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

/** Props of `InkUndo` and `InkRedo`: a toolbar button that may render through `child`. */
export interface InkHistoryButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
  children?: Snippet | undefined
  /** Render your own button: spread `props` on it. */
  child?: ChildSnippet | undefined
}
