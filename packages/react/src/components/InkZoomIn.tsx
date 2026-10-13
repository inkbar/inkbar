import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkZoomButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}

export function InkZoomIn({
  asChild = false,
  className,
  children,
  ...rest
}: InkZoomButtonProps) {
  const { zoomIn } = useZoom()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-zoom-in', className)}
      data-ink-zoom-in=""
      aria-label="Zoom in"
      title="Zoom in"
      onClick={() => zoomIn()}
      {...rest}
    >
      {children ?? '+'}
    </Toolbar.Button>
  )
}
