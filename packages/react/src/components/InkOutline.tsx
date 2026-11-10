import { createOutlineController, type OutlineController } from '@inkbar/core/dom'
import { ChevronRight } from '@inkbar/icons'
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { domAttrs } from '../dom-attrs'
import { useToReadable } from '../to-readable'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { OutlineItem } from '@inkbar/core'

export interface InkOutlineProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Shown when the document has no outline. Default: "This document has no outline". */
  emptyText?: string | undefined
  /**
   * Replaces an item's title, given the item and whether it is the current one and whether it
   * is expanded. Keep what it returns non-interactive.
   */
  renderItem?:
    | ((item: OutlineItem, state: { current: boolean; expanded: boolean }) => ReactNode)
    | undefined
}

// Stable fallbacks for before the controller exists and for the server.
const NO_ITEMS: readonly OutlineItem[] = []
const NO_EXPANDED: ReadonlySet<string> = new Set()

/**
 * The open document's outline as a tree: `createOutline`'s markup on core's outline
 * controller, which holds what is expanded, the Tab stop, the keys, the current item and
 * Back's history. Clicking an item, or Enter on it, follows it; its chevron expands and
 * collapses it. It fills its parent's height and scrolls, and keeps the item the reader has
 * reached in view. `renderItem` replaces an item's title. Inside `InkRoot`; the tree is empty
 * on the server.
 */
export function InkOutline({
  emptyText = 'This document has no outline',
  renderItem,
  className,
  ...rest
}: InkOutlineProps) {
  const ctx = useInkContext('InkOutline')
  const document = useToReadable(ctx.document)
  const viewport = useToReadable(ctx.viewport)
  const navigation = useToReadable(ctx.navigation)

  const root = useRef<HTMLDivElement>(null)
  // Built after mount, as the other controller-backed components do: it subscribes to the
  // document, so nothing is created while rendering on the server.
  const [controller, setController] = useState<OutlineController | null>(null)
  useLayoutEffect(() => {
    const c = createOutlineController({ document, viewport, navigation })
    setController(c)
    const unbind = c.bindScroll(root.current!)
    return () => {
      unbind()
      c.destroy()
      setController(null)
    }
  }, [document, viewport, navigation])

  const items = useReadable(controller?.items, NO_ITEMS)
  const loading = useReadable(controller?.loading, false)
  const expanded = useReadable(controller?.expanded, NO_EXPANDED)
  const current = useReadable(controller?.current, null)
  // Read so a render follows the Tab stop; `itemAttrs` carries it.
  useReadable(controller?.focused, null)

  const level = (id: string): number => id.split('.').length - 1
  const renderLevel = (list: readonly OutlineItem[]): ReactNode =>
    list.map((item) => {
      const c = controller!
      const open = expanded.has(item.id)
      const attrs: Record<string, string> = {}
      for (const [name, value] of Object.entries(c.itemAttrs(item.id))) {
        if (value !== undefined) attrs[name] = value
      }
      return (
        <li
          key={item.id}
          className="ink-outline-item"
          data-ink-outline-item={item.id}
          data-bold={item.bold ? '' : undefined}
          data-italic={item.italic ? '' : undefined}
          style={{ '--ink-outline-level': level(item.id) } as CSSProperties}
          {...domAttrs(attrs)}
        >
          <div
            className="ink-outline-row"
            {...c.rowAttrs(item.id)}
            onClick={() => c.activate(item.id)}
          >
            {item.children.length > 0 ? (
              <span
                className="ink-outline-toggle"
                aria-hidden="true"
                onClick={(e) => {
                  // Expanding is not following: the row's own click is not reached.
                  e.stopPropagation()
                  c.toggle(item.id)
                }}
              >
                <InkIcon icon={ChevronRight} />
              </span>
            ) : (
              <span className="ink-outline-spacer" aria-hidden="true" />
            )}
            <span className="ink-outline-title" {...c.titleAttrs(item.id)}>
              {renderItem
                ? renderItem(item, { current: current === item.id, expanded: open })
                : item.title}
            </span>
          </div>
          {item.children.length > 0 ? (
            <ul className="ink-outline-group" role="group" hidden={!open}>
              {renderLevel(item.children)}
            </ul>
          ) : null}
        </li>
      )
    })

  return (
    <div
      {...rest}
      ref={root}
      className={cx('ink-outline', className)}
      data-ink-outline=""
      aria-busy={loading ? 'true' : undefined}
    >
      <ul
        className="ink-outline-tree"
        role="tree"
        aria-label="Outline"
        hidden={items.length === 0}
        onKeyDown={(e) => controller?.onKeydown(e.nativeEvent)}
      >
        {controller ? renderLevel(items) : null}
      </ul>
      {controller && !loading && items.length === 0 ? (
        <p className="ink-outline-empty">{emptyText}</p>
      ) : null}
    </div>
  )
}
