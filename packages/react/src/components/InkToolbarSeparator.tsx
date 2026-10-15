import { cx } from '../class-names'

import type { ComponentPropsWithoutRef } from 'react'

export type InkToolbarSeparatorProps = ComponentPropsWithoutRef<'div'>

/**
 * A divider between groups of controls in a horizontal toolbar. Not focusable. A plain div
 * rather than Radix's separator, which reads as horizontal inside a horizontal toolbar.
 */
export function InkToolbarSeparator({ className, ...rest }: InkToolbarSeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cx('ink-toolbar-separator', className)}
      data-ink-toolbar-separator=""
      {...rest}
    />
  )
}
