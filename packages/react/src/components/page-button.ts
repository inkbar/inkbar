import type { ComponentPropsWithoutRef } from 'react'

/** Props of `InkPrevPage` and `InkNextPage`: a toolbar button that may render as its child. */
export interface InkPageButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}
