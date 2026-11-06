import { downloadDocument } from '@inkbar/core/dom'
import { Download } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

export interface InkDownloadButtonProps extends ComponentPropsWithoutRef<'button'> {
  asChild?: boolean
  /** The name to save under. Default: the document's `fileName`. */
  filename?: string | undefined
}

/**
 * Saves the open document's file through the browser's download, under its `fileName` or
 * `filename`. Disabled until the document is ready. Today that is the file as it was opened,
 * without this session's annotations.
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
  const { document: doc, status } = useInkContext('InkDownloadButton')
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-download', className)}
      data-ink-download=""
      aria-label="Download"
      title="Download"
      {...rest}
      disabled={disabled === true || doc === null || status.state !== 'ready'}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || !doc) return
        void downloadDocument(doc, filename === undefined ? {} : { filename }).catch(
          () => undefined
        )
      }}
    >
      {children ?? <InkIcon icon={Download} />}
    </Toolbar.Button>
  )
}
