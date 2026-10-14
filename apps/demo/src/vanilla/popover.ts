import { annotationElementFor } from '@inkbar/core/dom'

import { h } from './dom'

export interface Popover {
  readonly panel: HTMLElement
  /** Shows the panel under annotation `id`. False when the annotation is not on screen. */
  show(id: string): boolean
  hide(): void
  destroy(): void
}

/**
 * A panel fixed under an annotation's overlay element. Escape or a press outside it calls
 * `onClose`. Hiding returns focus to the annotation, or to the document when it has gone.
 */
export function createPopover(
  root: HTMLElement,
  attrs: Record<string, string>,
  onClose: () => void
): Popover {
  const panel = h('div', { ...attrs, role: 'dialog', hidden: '' })
  document.body.append(panel)
  let anchor: HTMLElement | null = null

  const place = (): void => {
    if (!anchor || panel.hidden) return
    const r = anchor.getBoundingClientRect()
    const left = Math.min(r.left, window.innerWidth - panel.offsetWidth - 8)
    panel.style.position = 'fixed'
    panel.style.left = `${Math.max(8, left)}px`
    panel.style.top = `${r.bottom + 6}px`
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || panel.hidden) return
    e.preventDefault()
    onClose()
  }
  const onPress = (e: PointerEvent): void => {
    const target = e.target as Node
    if (panel.hidden || panel.contains(target) || anchor?.contains(target)) return
    onClose()
  }
  document.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onPress, true)
  root.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)

  return {
    panel,
    show(id) {
      anchor = annotationElementFor(root, id)
      if (!anchor) return false
      panel.hidden = false
      place()
      return true
    },
    hide() {
      panel.hidden = true
      const back = anchor
      anchor = null
      if (back?.isConnected) back.focus()
      else root.querySelector<HTMLElement>('[data-ink-scroll]')?.focus()
    },
    destroy() {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress, true)
      root.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      panel.remove()
    },
  }
}
