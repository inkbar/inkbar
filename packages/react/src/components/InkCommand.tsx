/*
 * A plugin command as a toolbar button with its status beside it: the markup of core's
 * `createCommandButton`, so the theme styles both alike. The button is named by the command's
 * label, disabled while the command is, and `aria-busy` while it runs; the status is a live
 * region. A command without an icon shows its label as the button's text. Throws
 * `InkError('UnknownCommand')` for an id no plugin registered.
 */
import { Toolbar } from 'radix-ui'

import { useCommand } from '../hooks/useCommand'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'

export interface InkCommandProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'id' | 'children'
> {
  /** The command's namespaced id, such as `sandbox.suggest`. */
  id: string
  asChild?: boolean
  children?: ReactNode | ((props: { label: string; busy: boolean }) => ReactNode)
}

export function InkCommand({
  id,
  asChild = false,
  children,
  disabled,
  onClick,
  ...rest
}: InkCommandProps) {
  const { run, enabled, busy, status, label, icon } = useCommand(id)
  return (
    <div className="ink-command">
      <Toolbar.Button
        asChild={asChild}
        type="button"
        data-command={id}
        aria-label={label}
        title={label}
        aria-busy={busy}
        {...rest}
        disabled={disabled === true || !enabled}
        onClick={(e) => {
          onClick?.(e)
          if (!e.defaultPrevented) void run()
        }}
      >
        {typeof children === 'function'
          ? children({ label, busy })
          : (children ?? (icon ? <InkIcon icon={icon} /> : label))}
      </Toolbar.Button>
      <span className="ink-command-status" role="status">
        {status}
      </span>
    </div>
  )
}
