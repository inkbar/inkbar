import { ZoomIn } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import { InkIcon } from './InkIcon'

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
      {children ?? <InkIcon icon={ZoomIn} />}
    </Toolbar.Button>
  )
}
