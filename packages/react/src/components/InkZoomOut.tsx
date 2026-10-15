import { ZoomOut } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import { InkIcon } from './InkIcon'

import type { InkZoomButtonProps } from './zoom-button'

export function InkZoomOut({
  asChild = false,
  className,
  children,
  onClick,
  ...rest
}: InkZoomButtonProps) {
  const { zoomOut } = useZoom()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-zoom-out', className)}
      data-ink-zoom-out=""
      aria-label="Zoom out"
      title="Zoom out"
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) zoomOut()
      }}
    >
      {children ?? <InkIcon icon={ZoomOut} />}
    </Toolbar.Button>
  )
}
