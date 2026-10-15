import type { ComponentPropsWithoutRef } from 'react'

/** Props of `InkUndo` and `InkRedo`: a toolbar button that may render as its child. */
export interface InkHistoryButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}
