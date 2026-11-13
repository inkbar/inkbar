import { cx } from '../class-names'
import { useMessages } from '../hooks/useMessages'
import { usePage } from '../hooks/usePage'

import type { ComponentPropsWithoutRef } from 'react'

export function InkPageCount({ className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  const { count } = usePage()
  const m = useMessages()
  return (
    <span
      className={cx('ink-page-count', className)}
      data-ink-page-count=""
      aria-live="polite"
      {...rest}
    >
      {m.toolbar.pageOf({ total: count })}
    </span>
  )
}
