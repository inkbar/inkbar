/*
 * The card a mark opens: a core popover anchored to the mark, built from the plugin's
 * `CardSpec` and styled by the theme (`.ink-card` and its parts). One popover per viewer root,
 * made on first open. Each action is one undo step. After an action the card re-renders when
 * the mark stays; when it goes, the card closes and focus moves to the next mark, else the
 * previous one, else the viewport. Escape or a press outside closes it and focus goes back to
 * the mark. An open card re-renders when the viewer's messages change, so label functions in
 * its spec read the host's language again; when nothing it shows changes, it is left alone.
 */
import { resolveLabel, type Label } from '../../../messages'
import { createFocusReturn } from '../../popover-focus'
import { createPopover, type Popover } from '../../viewer/popover'
import { hostInternalsOf } from '../host'

import type { Records } from './records'
import type { RecordBase } from '../../../model/records'
import type { PluginContext } from '../define'

/** One of a card's buttons. */
export interface CardAction {
  /** The button's text; a function is read again whenever the viewer's messages change. */
  label: Label
  run(): void
}

/** What a mark's card shows. The theme styles it; `className` adds a class of your own. */
export interface CardSpec {
  /** The card's heading (`.ink-card-title`). */
  title: Label
  /** The dialog's accessible name. Default: `title`. */
  label?: Label
  /** A short line under the title (`.ink-card-meta`). */
  meta?: string
  /** A CSS colour for a dot before `meta` (`.ink-card-swatch`). */
  swatch?: string
  /** Text under the meta line (`.ink-card-body`). */
  body?: string
  /** A line of context with the match marked, after `body` (`.ink-card-excerpt`). */
  excerpt?: { before: string; match: string; after: string }
  /**
   * One button per key, or per entry of an array, in order (`.ink-card-actions`). A record's
   * keys are the buttons' text; an array's entries carry a `label`, which may be a function
   * read again when the viewer's messages change. The first takes focus on open and is
   * styled as the primary action. Each action runs synchronously in one undo step: writes after
   * an `await` fall outside it. When an action removes the mark, focus moves to the next of this
   * `marks()` handle's marks, else the previous, else the viewport.
   */
  actions: Record<string, () => void> | readonly CardAction[]
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

/**
 * The class list of a card's root: `ink-card` and the spec's own.
 *
 * @internal Shared with the record list.
 */
export function cardClass(spec: CardSpec): string {
  return spec.className ? `ink-card ${spec.className}` : 'ink-card'
}

/** One of a card's actions with the key it is run by. */
export interface CardActionEntry {
  /** The record form's key, or the array form's index as a string. */
  key: string
  label: Label
  run: () => void
}

/**
 * A card's actions in order, each with the key `RecordListController.act` takes: the key of
 * the record form, the index (`'0'`, `'1'`…) of the array form.
 *
 * @internal For the bindings' record lists.
 */
export function cardActions(spec: Pick<CardSpec, 'actions'>): CardActionEntry[] {
  const { actions } = spec
  if (isActionList(actions))
    return actions.map((a, i) => ({ key: String(i), label: a.label, run: () => a.run() }))
  return Object.entries(actions).map(([key, run]) => ({ key, label: key, run }))
}

function isActionList(actions: CardSpec['actions']): actions is readonly CardAction[] {
  return Array.isArray(actions)
}

/**
 * A card's parts, as the theme styles them: title, meta with its swatch, body, excerpt and the
 * actions, whose buttons call `act` with their key (see `cardActions`) and function. Labels are
 * resolved now.
 *
 * @internal Shared with the record list, whose rows are cards with no dialog around them.
 */
export function cardParts(
  spec: CardSpec,
  act: (key: string, fn: () => void) => void
): HTMLElement[] {
  const parts: HTMLElement[] = [el('p', 'ink-card-title', resolveLabel(spec.title))]
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
  if (spec.excerpt !== undefined) {
    const { before, match, after } = spec.excerpt
    parts.push(el('p', 'ink-card-excerpt', before, el('mark', '', match), after))
  }
  const actions = el('div', 'ink-card-actions')
  for (const { key, label, run } of cardActions(spec)) {
    const button = el('button', '', resolveLabel(label)) as HTMLButtonElement
    button.type = 'button'
    button.addEventListener('click', () => act(key, run))
    actions.append(button)
  }
  parts.push(actions)
  return parts
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

  /**
   * Fills the panel from `record`, keeping focus on the same action. With `ifChanged`, a card
   * that would look and read the same is left as it is, so new words that say the same thing
   * (a host passing equal messages again) do not replace its buttons.
   */
  const render = (record: T, ifChanged = false) => {
    const spec = opts.spec(record)
    const panel = popover!.panel
    const className = cardClass(spec)
    const label = resolveLabel(spec.label ?? spec.title)
    const parts = cardParts(spec, (_, fn) => act(fn))
    if (
      ifChanged &&
      panel.className === className &&
      panel.getAttribute('aria-label') === label &&
      parts.length === panel.children.length &&
      parts.every((part, i) => part.isEqualNode(panel.children[i]!))
    )
      return
    const buttons = () => [
      ...panel.querySelectorAll<HTMLButtonElement>('.ink-card-actions > button'),
    ]
    const focused = buttons().indexOf(document.activeElement as HTMLButtonElement)
    panel.className = className
    panel.setAttribute('aria-label', label)
    panel.replaceChildren(...parts)
    if (focused >= 0) {
      const now = buttons()
      ;(now[focused] ?? now[0])?.focus({ preventScroll: true })
    }
  }

  ctx.onDocument(() => {
    const refresh = (ifChanged: boolean) => {
      if (acting || shown === null) return
      const record = current()
      if (record) render(record, ifChanged)
      else close()
    }
    const stop = records.list.subscribe(() => refresh(false))
    // New words, or a plugin's label functions reading its own language again. Equal words,
    // which a host may pass on every render, leave the card as it is.
    const stopMessages = hostInternalsOf(ctx).messages.subscribe(() => refresh(true))
    return () => {
      stop()
      stopMessages()
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
