import type { Viewport } from './viewport'

export interface ViewportKeysOptions {
  viewport: Viewport
  /** Read on every key, so it follows the open document. */
  pageCount: () => number
}

/** Factor `+`/`=` zoom in by; `-` zooms out by its inverse. */
const ZOOM_STEP = 1.25

/** Keys typed here belong to the element, not the viewport. */
const IGNORE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-annotation]'

/**
 * Keyboard shortcuts for a focused viewport container: `+` or `=` and `-` zoom, `Home` and
 * `End` go to the first and last page, `PageDown` and `PageUp` to the next and previous.
 * Events from inputs, editable content and annotation elements, chords with Ctrl, Meta or
 * Alt (browser zoom stays the browser's), and events already handled are left alone. Only
 * handled keys are prevented. Returns a function that removes the listener.
 */
export function attachViewportKeys(
  el: HTMLElement,
  opts: ViewportKeysOptions
): () => void {
  const { viewport } = opts
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target instanceof Element && e.target.closest(IGNORE)) return
    switch (e.key) {
      case '+':
      case '=':
        viewport.zoomBy(ZOOM_STEP)
        break
      case '-':
        viewport.zoomBy(1 / ZOOM_STEP)
        break
      case 'Home':
        viewport.scrollToPage(0)
        break
      case 'End':
        viewport.scrollToPage(opts.pageCount() - 1)
        break
      case 'PageDown':
        viewport.scrollToPage(viewport.currentPage.get() + 1)
        break
      case 'PageUp':
        viewport.scrollToPage(viewport.currentPage.get() - 1)
        break
      default:
        return
    }
    e.preventDefault()
  }
  el.addEventListener('keydown', onKeydown)
  return () => el.removeEventListener('keydown', onKeydown)
}
