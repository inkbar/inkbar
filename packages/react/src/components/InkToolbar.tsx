import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkToolbarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'dir'> {
  /** Radix narrows text direction to these two values. */
  dir?: 'ltr' | 'rtl'
  label?: string
  asChild?: boolean
}

export function InkToolbar({
  label = 'Document tools',
  asChild = false,
  className,
  children,
  ...rest
}: InkToolbarProps) {
  return (
    <Toolbar.Root
      asChild={asChild}
      orientation="horizontal"
      aria-label={label}
      data-ink-toolbar=""
      className={cx('ink-toolbar', className)}
      {...rest}
    >
      {children}
    </Toolbar.Root>
  )
}
