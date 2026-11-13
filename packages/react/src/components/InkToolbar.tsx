import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { hostLabel, useMessages } from '../hooks/useMessages'

import type { Label } from '@inkbar/core'
import type { ComponentPropsWithoutRef } from 'react'

export interface InkToolbarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'dir'> {
  /** Radix narrows text direction to these two values. */
  dir?: 'ltr' | 'rtl'
  /**
   * The accessible name: a string, or a function read again whenever the root's `messages`
   * change. Default "Document tools", in the root's words.
   */
  label?: Label | undefined
  asChild?: boolean
}

export function InkToolbar({
  label,
  asChild = false,
  className,
  children,
  ...rest
}: InkToolbarProps) {
  const m = useMessages()
  return (
    <Toolbar.Root
      asChild={asChild}
      orientation="horizontal"
      aria-label={hostLabel(label, m.toolbar.label)}
      data-ink-toolbar=""
      className={cx('ink-toolbar', className)}
      {...rest}
    >
      {children}
    </Toolbar.Root>
  )
}
