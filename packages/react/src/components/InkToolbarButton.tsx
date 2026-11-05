import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkToolbarButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}

/**
 * Your own button in an `InkToolbar`. It joins the toolbar's arrow-key focus and takes the
 * theme's toolbar button styles; what it shows and does is up to you.
 */
export function InkToolbarButton({
  asChild = false,
  type = 'button',
  className,
  ...rest
}: InkToolbarButtonProps) {
  return (
    <Toolbar.Button
      asChild={asChild}
      type={type}
      className={cx('ink-toolbar-button', className)}
      data-ink-toolbar-button=""
      {...rest}
    />
  )
}
