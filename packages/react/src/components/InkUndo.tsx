import { Undo2 } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useHistory } from '../hooks/useHistory'

import { InkIcon } from './InkIcon'

import type { InkHistoryButtonProps } from './history-button'

export function InkUndo({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkHistoryButtonProps) {
  const { canUndo, undo } = useHistory()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-undo', className)}
      data-ink-undo=""
      aria-label="Undo"
      title="Undo"
      {...rest}
      disabled={disabled === true || !canUndo}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) undo()
      }}
    >
      {children ?? <InkIcon icon={Undo2} />}
    </Toolbar.Button>
  )
}
