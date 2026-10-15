import { ChevronLeft } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { usePage } from '../hooks/usePage'

import { InkIcon } from './InkIcon'

import type { InkPageButtonProps } from './page-button'

export function InkPrevPage({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkPageButtonProps) {
  const { current, previous } = usePage()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-prev-page', className)}
      data-ink-prev-page=""
      aria-label="Previous page"
      title="Previous page"
      disabled={disabled === true || current <= 0}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) previous()
      }}
    >
      {children ?? <InkIcon icon={ChevronLeft} />}
    </Toolbar.Button>
  )
}
