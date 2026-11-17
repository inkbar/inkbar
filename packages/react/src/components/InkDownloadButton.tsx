import { downloadDocument, fileBusy } from '@inkbar/core/dom'
import { Download } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useMessages } from '../hooks/useMessages'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkDownloadButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
  /** The name to save under. Default: the document's `fileName`. */
  filename?: string | undefined
}

/**
 * Saves the open document's file through the browser's download, under its `fileName` or
 * `filename`. Disabled until the document is ready. With InkRoot's `engine` and changes, that
 * is a copy with them written in; otherwise the file as it was opened. While a download or
 * print writes its copy the button is `aria-busy` and `aria-disabled`, keeping focus, and a
 * press does nothing. A copy that cannot be written reaches InkRoot's `onError`, and the reader
 * is told in InkViewport's message box.
 */
export function InkDownloadButton({
  asChild = false,
  filename,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: InkDownloadButtonProps) {
  const m = useMessages()
  const { document: doc, status, reportFileError } = useInkContext('InkDownloadButton')
  const busy = useReadable(doc ? fileBusy(doc) : undefined, false)
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-download', className)}
      data-ink-download=""
      aria-label={m.toolbar.download}
      title={m.toolbar.download}
      aria-busy={busy}
      // Disabled while it writes, but not `disabled`, so the button keeps focus.
      aria-disabled={busy || undefined}
      {...rest}
      disabled={
        disabled === true || (!busy && (doc === null || status.state !== 'ready'))
      }
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || !doc) return
        void downloadDocument(doc, filename === undefined ? {} : { filename }).catch(
          reportFileError
        )
      }}
    >
      {children ?? <InkIcon icon={Download} />}
    </Toolbar.Button>
  )
}
