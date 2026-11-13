import { printDocument } from '@inkbar/core/dom'
import { Printer } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useMessages } from '../hooks/useMessages'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkPrintButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}

/**
 * Prints the open document's file with the browser's own PDF viewer (on iOS, in a new tab).
 * Disabled until the document is ready. Today that is the file as it was opened, without this
 * session's annotations.
 */
export function InkPrintButton({
  asChild = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkPrintButtonProps) {
  const m = useMessages()
  const { document: doc, status } = useInkContext('InkPrintButton')
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-print', className)}
      data-ink-print=""
      aria-label={m.toolbar.print}
      title={m.toolbar.print}
      {...rest}
      disabled={disabled === true || doc === null || status.state !== 'ready'}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || !doc) return
        void printDocument(doc).catch(() => undefined)
      }}
    >
      {children ?? <InkIcon icon={Printer} />}
    </Toolbar.Button>
  )
}
