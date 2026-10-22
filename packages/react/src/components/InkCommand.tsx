/*
 * A plugin command as a toolbar button with its status beside it: the markup of core's
 * `createCommandButton`, so the theme styles both alike. The button is named by the command's
 * label, disabled while the command is, and `aria-busy` while it runs; the status is a live
 * region. A command without an icon shows its label as the button's text. Until the plugins
 * are set up (once InkRoot has mounted; never on the server) the button is disabled and
 * `aria-hidden`. After that, an id no plugin registered throws `InkError('UnknownCommand')`.
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
        // No label until the plugins are set up: the disabled button stays out of the
        // accessibility tree rather than go unnamed.
        aria-label={label || undefined}
        title={label || undefined}
        aria-hidden={label ? undefined : true}
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
