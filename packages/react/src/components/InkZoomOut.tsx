import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import type { InkZoomButtonProps } from './InkZoomIn'

export function InkZoomOut({
  asChild = false,
  className,
  children,
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
      onClick={() => zoomOut()}
      {...rest}
    >
      {children ?? '−'}
    </Toolbar.Button>
  )
}
