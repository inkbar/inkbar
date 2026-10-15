import { Redo2 } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useHistory } from '../hooks/useHistory'

import { InkIcon } from './InkIcon'

import type { InkHistoryButtonProps } from './history-button'

export function InkRedo({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkHistoryButtonProps) {
  const { canRedo, redo } = useHistory()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-redo', className)}
      data-ink-redo=""
      aria-label="Redo"
      title="Redo"
      {...rest}
      disabled={disabled === true || !canRedo}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) redo()
      }}
    >
      {children ?? <InkIcon icon={Redo2} />}
    </Toolbar.Button>
  )
}
