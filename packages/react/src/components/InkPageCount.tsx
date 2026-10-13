import { cx } from '../class-names'
import { usePage } from '../hooks/usePage'

import type { ComponentPropsWithoutRef } from 'react'

export function InkPageCount({ className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  const { count } = usePage()
  return (
    <span
      className={cx('ink-page-count', className)}
      data-ink-page-count=""
      aria-live="polite"
      {...rest}
    >
      {`of ${count}`}
    </span>
  )
}
