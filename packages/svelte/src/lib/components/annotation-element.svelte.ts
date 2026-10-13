import { observeAnnotationElement } from '@inkbar/core/dom'

/**
 * The overlay element core draws for an annotation, for anchoring a popover to it. Core
 * creates and removes these elements outside Svelte, so this follows the root's subtree while
 * an id is wanted.
 */
export function useAnnotationElement(
  root: () => HTMLElement | null,
  id: () => string | null
): { readonly current: HTMLElement | null } {
  let element = $state.raw<HTMLElement | null>(null)
  $effect(() => {
    const r = root()
    const i = id()
    if (!r || !i) {
      element = null
      return
    }
    return observeAnnotationElement(r, i, (el) => {
      element = el
    })
  })
  return {
    get current() {
      return element
    },
  }
}
