/*
 * The signature menu for a signature field, opened from the field's "Sign" button and anchored
 * to its box. It lists the saved signatures and "Create signature", as `InkSignatureMenu`
 * does. Picking one signs the field with it (`signField`); a signature made in
 * `InkSignatureDialog` signs the field once saved, without picking the signature tool. Focus
 * returns to the field. InkViewport mounts it, one per document; hosts compose nothing.
 */
import { InkError, signField, type SignatureTemplate } from '@inkbar/core'
import {
  focusInitialMenuItem,
  handleMenuKeys,
  SIGNATURE_LABELS,
  signatureMenuModel,
  watchDetached,
  type SignFieldRequest,
} from '@inkbar/core/dom'
import { Popover } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useInkContext } from '../context'
import { useLatest } from '../use-latest'
import { useReadable } from '../use-readable'

import { InkSignatureDialog } from './InkSignatureDialog'
import { SignatureMenuPanel } from './SignatureMenuPanel'

const NO_TEMPLATES: readonly SignatureTemplate[] = []

/** The field's own button, which focus returns to. */
const control = (req: SignFieldRequest | null): HTMLElement | null =>
  req?.anchor.querySelector<HTMLElement>('button.ink-form-control') ?? null

export function InkSignFieldPopover({
  request,
  onClose,
}: {
  /** The field to sign; `null` while the menu is closed. */
  request: SignFieldRequest | null
  onClose: () => void
}) {
  const ctx = useInkContext('InkSignFieldPopover')
  const { signatures, reportError } = ctx
  const templates = useReadable(signatures.templates, NO_TEMPLATES)
  // No signature is "chosen" here: each signing picks its own.
  const model = useMemo(() => signatureMenuModel(templates, {}), [templates])
  /** The field the dialog signs once its signature is saved. */
  const [creatingFor, setCreatingFor] = useState<SignFieldRequest | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  /**
   * The request the menu was last open for, kept to return focus once it closes. A request
   * that replaces the open one takes over, so focus returns to the field asked for last.
   */
  const last = useRef<SignFieldRequest | null>(null)
  /** Set while the menu closes for the dialog, which takes focus instead of the field. */
  const toDialog = useRef(false)
  const anchor = useMemo(() => ({ current: request?.anchor ?? null }), [request])
  const doc = ctx.document

  // An old removal error is not news when the menu opens again.
  useEffect(() => {
    if (request) signatures.clearRemoveError()
  }, [request, signatures])

  // The field's box went (its page unmounted, its layer rebuilt): the menu has nothing to
  // stand by.
  const close = useLatest(onClose)
  useEffect(() => {
    if (!request) return
    last.current = request
    return watchDetached(request.anchor, () => close.current())
  }, [request, close])

  /** Signs the request's field with `t`; a refusal (signed, read-only by now) goes to `onError`. */
  const sign = (req: SignFieldRequest, t: SignatureTemplate): void => {
    if (!doc) return
    try {
      signField(doc, req.field, req.widget, t)
    } catch (e) {
      if (!(e instanceof InkError)) throw e
      reportError(e)
    }
  }

  return (
    <>
      <Popover.Root open={request !== null} onOpenChange={(next) => !next && onClose()}>
        <Popover.Anchor virtualRef={anchor} />
        <Popover.Portal>
          {request ? (
            <Popover.Content
              ref={menu}
              role="menu"
              aria-label={SIGNATURE_LABELS.menu}
              className="ink-select-content ink-menu-content"
              data-ink-select-content=""
              data-ink-menu="signature"
              data-ink-sign-field-menu={request.field}
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              onOpenAutoFocus={(e) => {
                e.preventDefault()
                focusInitialMenuItem(e.currentTarget as HTMLElement)
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                if (!toDialog.current)
                  control(last.current)?.focus({ preventScroll: true })
                toDialog.current = false
              }}
              onInteractOutside={(e) => {
                // A press on this field's own button toggles the menu through the engine; it
                // must not also close it here first, or the click would open it again.
                const target = e.detail.originalEvent.target
                if (target instanceof Node && request.anchor.contains(target))
                  e.preventDefault()
              }}
              onKeyDown={(e) => handleMenuKeys(e.nativeEvent, e.currentTarget)}
            >
              <SignatureMenuPanel
                items={model.items}
                menu={menu}
                onChoose={(t) => {
                  onClose()
                  sign(request, t)
                }}
                onCreate={() => {
                  toDialog.current = true
                  setCreatingFor(request)
                  onClose()
                }}
              />
            </Popover.Content>
          ) : null}
        </Popover.Portal>
      </Popover.Root>
      <InkSignatureDialog
        open={creatingFor !== null}
        onOpenChange={(next) => {
          if (!next) setCreatingFor(null)
        }}
        select={false}
        onSave={(t) => {
          if (creatingFor) sign(creatingFor, t)
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          control(last.current)?.focus({ preventScroll: true })
        }}
      />
    </>
  )
}
