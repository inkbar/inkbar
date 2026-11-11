import { ArrowLeft } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { InkPageButtonProps } from './page-button'

/** Returns to where the view was before the last jump; disabled while there is nowhere to go. */
export function InkBack({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkPageButtonProps) {
  const ctx = useInkContext('InkBack')
  const canGoBack = useReadable(ctx.navigation?.canGoBack, false)
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-back', className)}
      data-ink-back=""
      aria-label="Back"
      title="Back"
      disabled={disabled === true || !canGoBack}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) ctx.navigation?.back()
      }}
    >
      {children ?? <InkIcon icon={ArrowLeft} />}
    </Toolbar.Button>
  )
}
