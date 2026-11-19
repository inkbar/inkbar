import { fileBusy, printDocument, redactionBusy } from '@inkbar/core/dom'
import { Printer } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useMessages } from '../hooks/useMessages'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkPrintButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
}

/**
 * Prints the open document's file with the browser's own PDF viewer (on iOS, in a new tab).
 * Disabled until the document is ready, and while its redaction marks are applied. It prints
 * what InkDownloadButton downloads, is busy while a copy is written as that button is, and
 * reports a failure the same way.
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
  const { document: doc, status, reportFileError } = useInkContext('InkPrintButton')
  const busy = useReadable(doc ? fileBusy(doc) : undefined, false)
  // The document's redaction marks are being applied: its file is about to be replaced.
  const redacting = useReadable(doc ? redactionBusy(doc) : undefined, false)
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-print', className)}
      data-ink-print=""
      aria-label={m.toolbar.print}
      title={m.toolbar.print}
      aria-busy={busy}
      // Disabled while it writes, but not `disabled`, so the button keeps focus.
      aria-disabled={busy || undefined}
      {...rest}
      disabled={
        disabled === true ||
        redacting ||
        (!busy && (doc === null || status.state !== 'ready'))
      }
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || !doc) return
        void printDocument(doc, { messages: m }).catch(reportFileError)
      }}
    >
      {children ?? <InkIcon icon={Printer} />}
    </Toolbar.Button>
  )
}
