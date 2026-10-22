/*
 * The card a mark opens: a core popover anchored to the mark, built from the plugin's
 * `CardSpec` and styled by the theme (`.ink-card` and its parts). One popover per viewer root,
 * made on first open. Each action is one undo step. After an action the card re-renders when
 * the mark stays; when it goes, the card closes and focus moves to the next mark, else the
 * previous one, else the viewport. Escape or a press outside closes it and focus goes back to
 * the mark.
 */
import { createFocusReturn } from '../../popover-focus'
import { createPopover, type Popover } from '../../viewer/popover'

import type { Records } from './records'
import type { RecordBase } from '../../../model/records'
import type { PluginContext } from '../define'

/** What a mark's card shows. The theme styles it; `className` adds a class of your own. */
export interface CardSpec {
  /** The card's heading (`.ink-card-title`). */
  title: string
  /** The dialog's accessible name. Default: `title`. */
  label?: string
  /** A short line under the title (`.ink-card-meta`). */
  meta?: string
  /** A CSS colour for a dot before `meta` (`.ink-card-swatch`). */
  swatch?: string
  /** Text under the meta line (`.ink-card-body`). */
  body?: string
  /**
   * One button per key, in order (`.ink-card-actions`). The first takes focus on open and is
   * styled as the primary action. Each action runs synchronously in one undo step: writes after
   * an `await` fall outside it. When an action removes the mark, focus moves to the next of this
   * `marks()` handle's marks, else the previous, else the viewport.
   */
  actions: Record<string, () => void>
  /** Classes added to the card. */
  className?: string
}

export interface CardOptions<T extends RecordBase> {
  /** The card for `record`. */
  spec(record: T): CardSpec
  /** Whether `record` still has a mark. */
  marked(record: T): boolean
  /** This handle's marks under `root`, in document order. */
  marks(root: HTMLElement): HTMLElement[]
}

export interface Card<T extends RecordBase> {
  /** Shows `record`'s card next to `mark`, focusing its first action. */
  open(record: T, mark: HTMLElement): void
  /** Whether the card is open on `mark`, for its `aria-expanded`. */
  expanded(mark: HTMLElement): boolean
}

function el(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag)
  e.className = className
  e.append(...children)
  return e
}

export function createCard<T extends RecordBase>(
  ctx: PluginContext,
  records: Records<T>,
  opts: CardOptions<T>
): Card<T> {
  /** Made on first open, in the viewer root the mark is in. */
  let popover: Popover | null = null
  let root: HTMLElement | null = null
  /** The record on show. */
  let shown: string | null = null
  /** Set while an action runs: the action decides what happens after it. */
  let acting = false
  /** The mark whose card is open: its `aria-expanded` is true. */
  let expanded: HTMLElement | null = null

  const expand = (mark: HTMLElement | null) => {
    expanded?.setAttribute('aria-expanded', 'false')
    expanded = mark
    mark?.setAttribute('aria-expanded', 'true')
  }

  /** The shown record as it stands now, while it still has a mark. */
  const current = (): T | undefined => {
    const record = shown === null ? undefined : records.find(shown)
    return record && opts.marked(record) ? record : undefined
  }

  const close = () => {
    shown = null
    expand(null)
    popover?.hide()
  }

  /** Runs `fn` as one undo step, then re-renders, or closes and moves focus on. */
  const act = (fn: () => void) => {
    if (!popover || !root || shown === null) return
    const marks = opts.marks(root)
    const i = popover.anchor ? marks.indexOf(popover.anchor) : -1
    const after = i < 0 ? [] : [...marks.slice(i + 1), ...marks.slice(0, i).reverse()]
    acting = true
    try {
      ctx.history.batch(fn)
    } finally {
      acting = false
    }
    const record = current()
    if (record) return render(record)
    // Focus first: the close then leaves it where it is.
    after.find((m) => m.isConnected)?.focus({ preventScroll: true })
    close()
  }

  /** Fills the panel from `record`, keeping focus on the same action. */
  const render = (record: T) => {
    const spec = opts.spec(record)
    const panel = popover!.panel
    const buttons = () => [
      ...panel.querySelectorAll<HTMLButtonElement>('.ink-card-actions > button'),
    ]
    const focused = buttons().indexOf(document.activeElement as HTMLButtonElement)
    panel.className = spec.className ? `ink-card ${spec.className}` : 'ink-card'
    panel.setAttribute('aria-label', spec.label ?? spec.title)
    const parts: HTMLElement[] = [el('p', 'ink-card-title', spec.title)]
    if (spec.meta !== undefined) {
      const meta = el('p', 'ink-card-meta', spec.meta)
      if (spec.swatch !== undefined) {
        const swatch = el('span', 'ink-card-swatch')
        swatch.style.background = spec.swatch
        meta.prepend(swatch)
      }
      parts.push(meta)
    }
    if (spec.body !== undefined) parts.push(el('p', 'ink-card-body', spec.body))
    const actions = el('div', 'ink-card-actions')
    for (const [label, fn] of Object.entries(spec.actions)) {
      const button = el('button', '', label) as HTMLButtonElement
      button.type = 'button'
      button.addEventListener('click', () => act(fn))
      actions.append(button)
    }
    parts.push(actions)
    panel.replaceChildren(...parts)
    if (focused >= 0) {
      const now = buttons()
      ;(now[focused] ?? now[0])?.focus({ preventScroll: true })
    }
  }

  ctx.onDocument(() => {
    const stop = records.list.subscribe(() => {
      if (acting || shown === null) return
      const record = current()
      if (record) render(record)
      else close()
    })
    return () => {
      stop()
      shown = null
      expand(null)
      popover?.destroy()
      popover = null
      root = null
    }
  })

  return {
    open(record, mark) {
      const viewer = mark.closest<HTMLElement>('[data-ink-root]')
      if (!viewer) return
      if (viewer !== root) {
        popover?.destroy()
        root = viewer
        popover = createPopover({
          root: viewer,
          attrs: { class: 'ink-card' },
          focusReturn: createFocusReturn({ root: () => viewer, activated: () => null }),
          onDismiss: close,
        })
      }
      shown = record.id
      render(record)
      popover!.showAt(mark)
      expand(mark)
      popover!.panel.querySelector<HTMLElement>('.ink-card-actions > button')?.focus()
    },
    expanded: (mark) => mark === expanded,
  }
}
