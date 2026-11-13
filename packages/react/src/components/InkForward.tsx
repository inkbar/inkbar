import { ArrowRight } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useMessages } from '../hooks/useMessages'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { InkPageButtonProps } from './page-button'

/** Goes forward again after Back; disabled until Back is used. */
export function InkForward({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkPageButtonProps) {
  const m = useMessages()
  const ctx = useInkContext('InkForward')
  const canGoForward = useReadable(ctx.navigation?.canGoForward, false)
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-forward', className)}
      data-ink-forward=""
      aria-label={m.toolbar.forward}
      title={m.toolbar.forward}
      disabled={disabled === true || !canGoForward}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) ctx.navigation?.forward()
      }}
    >
      {children ?? <InkIcon icon={ArrowRight} />}
    </Toolbar.Button>
  )
}
