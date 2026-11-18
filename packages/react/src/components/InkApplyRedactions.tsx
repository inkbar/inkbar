import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useMessages } from '../hooks/useMessages'
import { useRedaction } from '../hooks/useRedaction'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'

export interface InkApplyRedactionsProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  asChild?: boolean
  children?:
    | ReactNode
    | ((props: { label: string; busy: boolean; disabled: boolean }) => ReactNode)
}

/**
 * Applies the open document's redaction marks, as `useRedaction().apply` does: asks first
 * (InkRoot's `redactionConfirm`), removes the content under them and shows the redacted file.
 * Disabled until the document is ready, was opened with InkRoot's `engine` and holds a mark.
 * While the marks are applied the button says so and is `aria-busy` and `aria-disabled`,
 * keeping focus, and a press does nothing. A children function receives
 * `{ label, busy, disabled }`, for a host's own content or, with `asChild`, its own element.
 */
export function InkApplyRedactions({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkApplyRedactionsProps) {
  const m = useMessages()
  const { canRedact, busy, apply } = useRedaction()
  const label = busy ? m.viewer.redacting : m.viewer.applyRedactions
  const off = !canRedact && !busy
  return (
    <Toolbar.Button
      asChild={asChild}
      type="button"
      className={cx('ink-apply-redactions', className)}
      data-ink-apply-redactions=""
      aria-busy={busy}
      // Disabled while it applies, but not `disabled`, so the button keeps focus.
      aria-disabled={busy || undefined}
      {...rest}
      disabled={disabled === true || off}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) void apply()
      }}
    >
      {typeof children === 'function'
        ? children({ label, busy, disabled: off })
        : (children ?? label)}
    </Toolbar.Button>
  )
}
