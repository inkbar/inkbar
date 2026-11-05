import {
  createRecordListController,
  type RecordListController,
  type RecordListRow,
  type RecordListSource,
} from '@inkbar/core/dom'
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useLatest } from '../use-latest'
import { useReadable } from '../use-readable'

export interface RecordCardsProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  source: RecordListSource | null
  /** Whether the empty text shows when there are no rows. Default true. */
  emptyShown?: boolean | undefined
  /** Replaces "Nothing here yet."; null shows nothing. */
  empty?: ReactNode
  /** Called with the number listed whenever it changes. */
  onCountChange?: ((count: number) => void) | undefined
}

const NO_ROWS: readonly RecordListRow[] = Object.freeze([])

/** A focused action button whose row re-renders: where to put focus back if it goes. */
interface HeldFocus {
  button: HTMLElement
  id: string
  index: number
}

const actionButtons = (row: Element): HTMLElement[] => [
  ...row.querySelectorAll<HTMLElement>('.ink-card-actions > button'),
]

/**
 * A record list's markup on core's record list controller, shared by `InkRecordList` and
 * `InkSearchResults`: `createRecordList`'s `div.ink-records` holding `ul.ink-record-list` with
 * one `li.ink-record` card per row, the empty text and a polite live region. The controller
 * holds the rows, the count and the announcement, and handles the clicks, keys, Tab stop,
 * focus and scrolling. Empty, with no empty text, until there is a source.
 */
export function RecordCards({
  source,
  emptyShown = true,
  empty,
  onCountChange,
  className,
  ...rest
}: RecordCardsProps) {
  const root = useRef<HTMLDivElement>(null)
  const [controller, setController] = useState<RecordListController | null>(null)
  const latest = useLatest(onCountChange)
  /** The count last reported, across sources and StrictMode's replayed effects. */
  const reported = useRef<number | null>(null)
  const held = useRef<HeldFocus | null>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!source || !el) return
    const c = createRecordListController(source)
    const report = (count: number): void => {
      if (count === reported.current) return
      reported.current = count
      latest.current?.(count)
    }
    /**
     * Before the rows re-render under a focused action whose button goes (its card lost that
     * action), note where it was; the layout effect below focuses the same place in the card,
     * else the row. A row that goes is the controller's to re-home.
     */
    const holdActionFocus = (): void => {
      const active = el.ownerDocument.activeElement
      if (!(active instanceof HTMLButtonElement) || !el.contains(active)) return
      const row = active.closest<HTMLElement>('[data-ink-record]')
      const id = row?.dataset.inkRecord
      if (!row || id === undefined) return
      held.current = { button: active, id, index: actionButtons(row).indexOf(active) }
    }
    setController(c)
    report(c.count.get())
    const stops = [c.rows.subscribe(holdActionFocus), c.count.subscribe(report)]
    const detach = c.attach(el)
    return () => {
      for (const stop of stops) stop()
      detach()
      c.destroy()
      setController(null)
    }
  }, [source, latest])

  const rows = useReadable(controller?.rows, NO_ROWS)
  const announcement = useReadable(controller?.announcement, '')
  const showEmpty = controller !== null && rows.length === 0 && emptyShown

  useLayoutEffect(() => {
    const focus = held.current
    const el = root.current
    held.current = null
    if (!focus || !el || focus.button.isConnected) return
    const row = [...el.querySelectorAll<HTMLElement>('[data-ink-record]')].find(
      (r) => r.dataset.inkRecord === focus.id
    )
    if (row) (actionButtons(row)[focus.index] ?? row).focus({ preventScroll: true })
  }, [rows])

  return (
    <div
      {...rest}
      ref={root}
      className={cx('ink-records', className)}
      data-ink-records=""
      tabIndex={-1}
    >
      <ul className="ink-record-list" role="list" hidden={rows.length === 0}>
        {/* The controller sets each row's tabindex. */}
        {rows.map(({ item, card, selected }) => (
          <li
            key={item.id}
            className="ink-record"
            data-ink-record={item.id}
            aria-current={selected ? 'true' : undefined}
            data-selected={selected ? '' : undefined}
          >
            <div className={cx('ink-card', card?.className)}>
              {card ? (
                <>
                  <p className="ink-card-title">{card.title}</p>
                  {card.meta !== undefined ? (
                    <p className="ink-card-meta">
                      {card.swatch !== undefined ? (
                        <span
                          className="ink-card-swatch"
                          style={{ background: card.swatch }}
                        />
                      ) : null}
                      {card.meta}
                    </p>
                  ) : null}
                  {card.body !== undefined ? (
                    <p className="ink-card-body">{card.body}</p>
                  ) : null}
                  {card.excerpt !== undefined ? (
                    <p className="ink-card-excerpt">
                      {card.excerpt.before}
                      <mark>{card.excerpt.match}</mark>
                      {card.excerpt.after}
                    </p>
                  ) : null}
                  <div className="ink-card-actions">
                    {Object.keys(card.actions).map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => controller?.act(item.id, label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="ink-record-list-empty" hidden={!showEmpty}>
        {empty === undefined ? 'Nothing here yet.' : empty}
      </p>
      <div className="ink-visually-hidden" aria-live="polite" data-ink-record-status="">
        {announcement}
      </div>
    </div>
  )
}
