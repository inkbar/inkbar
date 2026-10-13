import type { ComponentPropsWithoutRef } from 'react'

/** Props of `InkZoomIn` and `InkZoomOut`: a toolbar button that may render as its child. */
export interface InkZoomButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}
