/*
 * Marks drawn from records: one `<button>` per matching record on its page, in the plugin's
 * own layer, placed from the record's rect in user space through the page transform. Marks are
 * keyed by record id and reconciled in place, so a mark that stays keeps its element, and with
 * it focus, through a zoom, a rotation or another record's change. They redraw whenever the
 * records change (undo and redo included) and on `refresh()`. With `scrollToFirst()`, the viewer
 * scrolls to records as they start to get a mark.
 *
 * Presses and clicks on a mark are the plugin's: they go no further, so neither the active tool
 * nor listeners on the viewer's root see them. Enter and Space activate it, as on any button.
 */
import { createCard, type CardSpec } from './card'

import type { Records } from './records'
import type { Rect } from '../../../model/geometry'
import type { RecordBase, RecordChange } from '../../../model/records'
import type { PageTransform } from '../../transform'
import type { PluginContext } from '../define'

export interface MarksOptions<T extends RecordBase & { page: number }> {
  /** Where the record's mark goes on its page, in user space. */
  rect(record: T): Rect
  /** The mark's accessible name. */
  label(record: T): string
  /** Only records that pass get a mark. Default: all. */
  where?(record: T): boolean
  /**
   * Inline style for the mark, camel-case properties and `--custom` properties alike. Core draws
   * nothing else: the look is the plugin's CSS.
   */
  style?(record: T): Partial<CSSStyleDeclaration> & { [property: `--${string}`]: string }
  /** Classes every mark gets. */
  className?: string
  /**
   * More attributes (`data-*`, `aria-*`). `data-record`, `data-plugin` and `aria-label` stay
   * core's, and so do `aria-haspopup` and `aria-expanded` on a mark with a card; `style`,
   * `class` and `type` are skipped (use `style` and `className`).
   */
  attrs?(record: T): Record<string, string>
  /**
   * The card a mark opens when activated: a popover next to it, styled by the theme. Each
   * action is one undo step. The mark gets `aria-haspopup="dialog"`, and `aria-expanded` true
   * while its card is open.
   */
  card?(record: T): CardSpec
  /** Runs when the mark is clicked, or activated with Enter or Space, after `card` opens. */
  onActivate?(record: T, mark: HTMLButtonElement): void
}

export interface MarksHandle {
  /** Redraws every mark, for marks that read state outside the records. */
  refresh(): void
  /**
   * From now on, when records start to get a mark (added, or changed to pass `where`), the
   * viewer scrolls to the first of them in reading order, unless it is in view already. Records
   * a document opens with, and undo and redo, never scroll. Focus stays where it is. Returns
   * the handle.
   */
  scrollToFirst(): MarksHandle
}

/** Events stopped on a mark, so the viewer's root never sees a press on it. */
const STOPPED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'] as const

/** Attributes the plugin's `attrs` cannot set: core sets them, or they have options of their own. */
const RESERVED = new Set(['style', 'class', 'type'])

/** What a mark last had applied, so the next draw can drop what is no longer asked for. */
interface Applied<T> {
  record: T
  style: string[]
  attrs: string[]
}

export function createMarks<T extends RecordBase & { page: number }>(
  ctx: PluginContext,
  records: Records<T>,
  opts: MarksOptions<T>
): MarksHandle {
  const applied = new WeakMap<HTMLButtonElement, Applied<T>>()
  const marked = (record: T) => opts.where?.(record) ?? true

  const spec = opts.card?.bind(opts)
  const card =
    spec &&
    createCard(ctx, records, {
      spec,
      marked,
      marks: (root) =>
        [
          ...root.querySelectorAll<HTMLButtonElement>(
            `.ink-plugin-layer[data-plugin="${ctx.id}"] > button`
          ),
        ].filter((mark) => applied.has(mark)),
    })

  /** What activating a mark does. */
  const activate = (record: T, mark: HTMLButtonElement) => {
    card?.open(record, mark)
    opts.onActivate?.(record, mark)
  }

  const create = (doc: Document): HTMLButtonElement => {
    const mark = doc.createElement('button')
    if (opts.className) mark.className = opts.className
    for (const type of STOPPED) mark.addEventListener(type, (e) => e.stopPropagation())
    // A button's click comes from Enter and Space too.
    mark.addEventListener('click', () => {
      const state = applied.get(mark)
      if (state) activate(state.record, mark)
    })
    return mark
  }

  /** Brings `mark` up to date with `record`, placed through `transform`. */
  const apply = (mark: HTMLButtonElement, record: T, transform: PageTransform) => {
    const prev = applied.get(mark)
    const style = (opts.style?.(record) ?? {}) as Record<string, string>
    const styleNames = Object.keys(style).map(toCssName)
    const attrs = Object.fromEntries(
      Object.entries(opts.attrs?.(record) ?? {}).filter(
        ([name]) => !RESERVED.has(name.toLowerCase())
      )
    )
    for (const name of prev?.style ?? [])
      if (!styleNames.includes(name)) mark.style.removeProperty(name)
    for (const key of prev?.attrs ?? []) if (!(key in attrs)) mark.removeAttribute(key)
    for (const [key, value] of Object.entries(style))
      mark.style.setProperty(toCssName(key), value)
    for (const [name, value] of Object.entries(attrs)) mark.setAttribute(name, value)
    // Core's own, whatever the plugin asked for.
    mark.type = 'button'
    mark.style.position = 'absolute'
    mark.dataset.record = record.id
    mark.dataset.plugin = ctx.id
    mark.setAttribute('aria-label', opts.label(record))
    if (card) {
      mark.setAttribute('aria-haspopup', 'dialog')
      mark.setAttribute('aria-expanded', String(card.expanded(mark)))
    }
    const r = transform.toCssRect(opts.rect(record))
    mark.style.left = `${r.left}px`
    mark.style.top = `${r.top}px`
    mark.style.width = `${r.width}px`
    mark.style.height = `${r.height}px`
    applied.set(mark, {
      record,
      style: styleNames,
      attrs: Object.keys(attrs),
    })
  }

  /**
   * Makes `el`'s marks match the page's records, in list order: marks that stay are moved,
   * new ones inserted, the rest removed.
   */
  const draw = (el: HTMLElement, page: number, transform: PageTransform) => {
    const list = records.list.get().filter((r) => r.page === page && marked(r))
    const ids = new Set(list.map((r) => r.id))
    const kept = new Map<string, HTMLButtonElement>()
    for (const mark of [...el.children] as HTMLButtonElement[]) {
      const id = mark.dataset.record
      if (id !== undefined && ids.has(id) && !kept.has(id)) kept.set(id, mark)
      else mark.remove()
    }
    let next = el.firstElementChild
    for (const record of list) {
      const mark = kept.get(record.id) ?? create(el.ownerDocument)
      apply(mark, record, transform)
      if (mark === next) next = mark.nextElementSibling
      else el.insertBefore(mark, next)
    }
  }

  let scrolling = false
  /** Ids that started to get a mark in the change under way, read once it settles. */
  const fresh = new Set<string>()

  /** Scrolls to the first fresh record still marked, so a batch of adds scrolls once. */
  const reveal = () => {
    const [first] = [...fresh]
      .map((id) => records.find(id))
      .filter((r): r is T => r !== undefined && marked(r))
      .sort(readingOrder((r) => opts.rect(r)))
    fresh.clear()
    if (first)
      ctx.scrollTo(first.page, opts.rect(first), {
        behavior: reducedMotion() ? 'instant' : 'smooth',
      })
  }

  /** Notes a record that starts to get a mark; replaces (undo, redo, reset) never count. */
  const watch = (change: RecordChange<T>) => {
    const record =
      change.kind === 'add'
        ? change.record
        : change.kind === 'update' && !marked(change.before)
          ? change.after
          : undefined
    if (!record || !marked(record)) return
    if (fresh.size === 0) queueMicrotask(reveal)
    fresh.add(record.id)
  }

  const layer = ctx.layer({ render: draw })
  ctx.onDocument(() => {
    const stopDraw = records.list.subscribe(() => layer.invalidate())
    const stopWatch = records.store()?.on('change', (change) => {
      if (scrolling) watch(change)
    })
    return () => {
      stopDraw()
      stopWatch?.()
      // A reveal still pending belongs to this document, not the next one.
      fresh.clear()
    }
  })
  const handle: MarksHandle = {
    refresh: () => layer.invalidate(),
    scrollToFirst() {
      scrolling = true
      return handle
    },
  }
  return handle
}

/** Page first, then top to bottom and left to right, by each record's rect in user space. */
function readingOrder<T extends { page: number }>(rect: (record: T) => Rect) {
  return (a: T, b: T) => {
    const ra = rect(a)
    const rb = rect(b)
    return a.page - b.page || rb.y + rb.height - (ra.y + ra.height) || ra.x - rb.x
  }
}

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** `borderColor` → `border-color`, as `setProperty` takes it; `--custom` names stay as given. */
function toCssName(key: string): string {
  return key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}
