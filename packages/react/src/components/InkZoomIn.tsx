import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import type { InkZoomButtonProps } from './zoom-button'

export function InkZoomIn({
  asChild = false,
  className,
  children,
  onClick,
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
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) zoomIn()
      }}
    >
      {children ?? '+'}
    </Toolbar.Button>
  )
}
