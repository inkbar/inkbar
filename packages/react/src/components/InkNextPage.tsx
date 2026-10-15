import { ChevronRight } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { usePage } from '../hooks/usePage'

import { InkIcon } from './InkIcon'

import type { InkPageButtonProps } from './page-button'

export function InkNextPage({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkPageButtonProps) {
  const { current, count, next } = usePage()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-next-page', className)}
      data-ink-next-page=""
      aria-label="Next page"
      title="Next page"
      disabled={disabled === true || current >= count - 1}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) next()
      }}
    >
      {children ?? <InkIcon icon={ChevronRight} />}
    </Toolbar.Button>
  )
}
