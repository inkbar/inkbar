import {
  createThumbnailsController,
  THUMBNAIL_WIDTH,
  type ThumbnailsController,
  type ThumbnailsState,
} from '@inkbar/core/dom'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { domAttrs } from '../dom-attrs'
import { useToReadable } from '../to-readable'
import { useLatest } from '../use-latest'
import { useReadable } from '../use-readable'

import { InkThumbnail } from './InkThumbnail'

export interface InkThumbnailsProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** 0-based pages to list, in order. Default: every page. */
  pages?: readonly number[] | undefined
  /**
   * Thumbnail width in CSS pixels. Default: `--ink-thumbnail-width` (px only) capped at the
   * list's width less a 16px gutter each side; with the token unset, that fit.
   */
  width?: number | undefined
  /** Draw each page's annotations. Default true. */
  annotations?: boolean | undefined
  /** Draw plugin marks. Default true. */
  marks?: boolean | undefined
  /**
   * Renders inside each item, after its page number. The item's height is fixed from the
   * page's, so keep what you add out of the flow (position it absolutely) or small.
   */
  renderItem?: ((item: { page: number; current: boolean }) => ReactNode) | undefined
}

/** Until the list mounts, and on the server: nothing listed. */
const EMPTY: ThumbnailsState = {
  pages: [],
  current: -1,
  window: { start: 0, end: 0 },
  offsets: [0],
  width: THUMBNAIL_WIDTH,
}

/**
 * The pages as a list of thumbnails: `createThumbnails`' markup on core's thumbnails
 * controller, which holds the current page, the keys, the clicks, the Tab stop and the window.
 * Only the items near the visible part are mounted, each placed at its offset over a spacer of
 * the full height, and each holds an `InkThumbnail`. An item is a button that scrolls the
 * viewport to its page; the current page's has `aria-current="page"`. Inside `InkRoot`; it
 * renders empty on the server.
 */
export function InkThumbnails({
  pages,
  width,
  annotations = true,
  marks = true,
  renderItem,
  className,
  ...rest
}: InkThumbnailsProps) {
  const ctx = useInkContext('InkThumbnails')
  const document = useToReadable(ctx.document)
  const pluginHost = useToReadable(ctx.pluginHost)
  const viewport = useToReadable(ctx.viewport)
  const options = useMemo(
    () => ({ pages, width, annotations, marks }),
    [pages, width, annotations, marks]
  )
  const latest = useLatest(options)

  const scroller = useRef<HTMLDivElement>(null)
  const [controller, setController] = useState<ThumbnailsController | null>(null)
  // A list unchanged in content publishes nothing, so an inline `pages` array cannot loop.
  useLayoutEffect(() => {
    controller?.update(options)
  }, [controller, options])
  useLayoutEffect(() => {
    const c = createThumbnailsController(
      { document, pluginHost, viewport, messages: ctx.messageState },
      latest.current
    )
    setController(c)
    c.attach(scroller.current!)
    return () => {
      c.destroy()
      setController(null)
    }
  }, [document, pluginHost, viewport, ctx.messageState, latest])
  const state = useReadable(controller?.state, EMPTY)

  const { window: win, offsets } = state
  const items = state.pages.slice(win.start, win.end).map((page, k) => {
    const top = offsets[win.start + k]!
    const bottom = offsets[win.start + k + 1]!
    // Only a mounted controller has a window, so `controller` is set here.
    const attrs = controller?.itemAttrs(win.start + k) ?? {}
    return { page, current: page === state.current, top, height: bottom - top, attrs }
  })

  return (
    <div
      {...rest}
      ref={scroller}
      className={cx('ink-thumbnails', className)}
      data-ink-thumbnails=""
      role="list"
    >
      <div
        className="ink-thumbnails-spacer"
        aria-hidden="true"
        style={{ height: `${offsets.at(-1) ?? 0}px` }}
      />
      {items.map((item) => (
        <div
          key={item.page}
          className="ink-thumbnails-entry"
          {...domAttrs(item.attrs)}
          style={{ top: `${item.top}px`, height: `${item.height}px` }}
        >
          {/* The controller sets the tabindex. The thumbnail names the button "Page N"; the
              visible number repeats it. */}
          <button
            type="button"
            className="ink-thumbnails-item"
            data-ink-thumbnail-item={item.page}
            aria-current={item.current ? 'page' : undefined}
          >
            <InkThumbnail
              page={item.page}
              width={state.width}
              annotations={annotations}
              marks={marks}
            />
            <span className="ink-thumbnails-label" aria-hidden="true">
              {item.page + 1}
            </span>
            {renderItem?.({ page: item.page, current: item.current })}
          </button>
        </div>
      ))}
    </div>
  )
}
