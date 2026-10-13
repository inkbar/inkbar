/** The overlay element drawn for annotation `id` under `root`, if it is in the DOM. */
export function annotationElementFor(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-annotation="${CSS.escape(id)}"]`)
}

/**
 * Resolves the overlay element for `id` and keeps resolving while `root`'s subtree changes:
 * the overlay creates and removes these elements outside any framework (a page mounts as it
 * scrolls into view), so a popover anchored to one has to follow. Calls `onChange` once now
 * and again whenever the answer changes. The returned function stops observing.
 */
export function observeAnnotationElement(
  root: HTMLElement,
  id: string,
  onChange: (el: HTMLElement | null) => void
): () => void {
  let last: HTMLElement | null | undefined
  const resolve = (): void => {
    const found = annotationElementFor(root, id)
    if (found === last) return
    last = found
    onChange(found)
  }
  resolve()
  const observer = new MutationObserver(resolve)
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
