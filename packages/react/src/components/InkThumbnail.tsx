import { createThumbnailPainter, type ThumbnailPainter } from '@inkbar/core/dom'
import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useToReadable } from '../to-readable'
import { useLatest } from '../use-latest'

export interface InkThumbnailProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** 0-based. */
  page: number
  /** Width in CSS pixels; the height follows the page. Default 120 unless `height` is given. */
  width?: number | undefined
  /** Height in CSS pixels; the width follows the page. */
  height?: number | undefined
  /** Draw the page's annotations. Default true. */
  annotations?: boolean | undefined
  /** Draw plugin marks. Default true. */
  marks?: boolean | undefined
  /** The accessible name. Default "Page N". */
  label?: string | undefined
}

/**
 * One page as a static image, with its live annotations and plugin marks: core's thumbnail
 * painter on this element, which sizes it, names it ("Page N" unless `label` says otherwise)
 * and draws it once it nears the visible area. It is not focusable and does nothing on click:
 * wrap it in the control you need. Inside `InkRoot`; it renders empty on the server.
 */
export function InkThumbnail({
  page,
  width,
  height,
  annotations = true,
  marks = true,
  label,
  className,
  ...rest
}: InkThumbnailProps) {
  const ctx = useInkContext('InkThumbnail')
  const document = useToReadable(ctx.document)
  const pluginHost = useToReadable(ctx.pluginHost)
  const options = useMemo(
    () => ({ page, width, height, annotations, marks, label }),
    [page, width, height, annotations, marks, label]
  )
  const latest = useLatest(options)

  const el = useRef<HTMLDivElement>(null)
  const painter = useRef<ThumbnailPainter | null>(null)
  // Before the painter is made, so a new painter does not take its first options twice.
  useLayoutEffect(() => {
    painter.current?.update(options)
  }, [options])
  useLayoutEffect(() => {
    const p = createThumbnailPainter(
      el.current!,
      { document, pluginHost },
      latest.current
    )
    painter.current = p
    return () => {
      p.destroy()
      painter.current = null
    }
  }, [document, pluginHost, latest])

  // The class is the painter's too: kept here, a re-render never drops it.
  return <div {...rest} ref={el} className={cx('ink-thumbnail', className)} />
}
