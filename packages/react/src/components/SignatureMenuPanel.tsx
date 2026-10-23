/*
 * The signature menu's items: the saved signatures as previews, each with a remove button,
 * then "Create signature", and the store's removal error. The toolbar's `InkSignatureMenu`
 * and a signature field's `InkSignFieldPopover` both render it inside their `role="menu"`
 * content, which `menu` points at.
 */
import { signaturePreview, SIGNATURE_LABELS } from '@inkbar/core/dom'
import { Plus, Trash2 } from '@inkbar/icons'
import { useEffect, useRef, type RefObject } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { SignatureTemplate } from '@inkbar/core'
import type { SignatureMenuItem } from '@inkbar/core/dom'

const NO_TEMPLATES: readonly SignatureTemplate[] = []

/** A saved signature drawn small: ink as filled outlines, an image as itself. */
function SignaturePreview({ template }: { template: SignatureTemplate }) {
  if (template.kind === 'image')
    return (
      <span className="ink-signature-preview" data-kind="image">
        <img src={template.imagedata} alt="" draggable={false} />
      </span>
    )
  const { viewBox, paths } = signaturePreview(template)
  return (
    <span className="ink-signature-preview" data-kind="ink">
      <svg viewBox={viewBox} aria-hidden="true">
        {paths.map((d, i) => (
          <path key={i} d={d} fill="currentColor" />
        ))}
      </svg>
    </span>
  )
}

export function SignatureMenuPanel({
  items,
  menu,
  onChoose,
  onCreate,
}: {
  items: readonly SignatureMenuItem[]
  /** The menu element the items sit in, for moving focus after a removal. */
  menu: RefObject<HTMLElement | null>
  onChoose: (template: SignatureTemplate) => void
  onCreate: () => void
}) {
  const { signatures } = useInkContext('SignatureMenuPanel')
  const templates = useReadable(signatures.templates, NO_TEMPLATES)
  const removeError = useReadable(signatures.removeError, undefined)
  /** The row of a removed signature, until focus lands on what took its place. */
  const removedRow = useRef<number | null>(null)

  useEffect(() => {
    const row = removedRow.current
    const panel = menu.current
    if (row === null || !panel) return
    removedRow.current = null
    const rows = panel.querySelectorAll<HTMLElement>('.ink-signature-item')
    const next =
      rows[Math.min(row, rows.length - 1)] ??
      panel.querySelector<HTMLElement>('[data-ink-signature-create]')
    next?.focus({ preventScroll: true })
  }, [templates, menu])

  const remove = (id: string, row: number): void => {
    // Set first: the list may re-render before the removal's promise settles.
    removedRow.current = row
    signatures.remove(id).catch(() => {
      // The host's store refused: the signature stays.
      removedRow.current = null
    })
  }

  return (
    <>
      {items.length > 0 ? (
        <>
          <div
            role="group"
            aria-label={SIGNATURE_LABELS.saved}
            className="ink-signature-list"
            data-ink-menu-columns={2}
          >
            {items.map((item, row) => [
              <button
                key={`${item.id}-choose`}
                type="button"
                role="menuitemradio"
                aria-checked={item.checked}
                aria-label={item.label}
                tabIndex={-1}
                className="ink-select-item ink-menu-item ink-signature-item"
                data-ink-select-item=""
                data-key={item.id}
                data-state={item.checked ? 'checked' : 'unchecked'}
                onClick={() => onChoose(item.template)}
              >
                <SignaturePreview template={item.template} />
              </button>,
              <button
                key={`${item.id}-remove`}
                type="button"
                role="menuitem"
                aria-label={item.removeLabel}
                title={item.removeLabel}
                tabIndex={-1}
                className="ink-menu-item ink-signature-remove"
                data-ink-signature-remove=""
                data-key={item.id}
                onClick={() => remove(item.id, row)}
              >
                <InkIcon icon={Trash2} size={16} />
              </button>,
            ])}
          </div>
          <div role="separator" className="ink-select-separator" />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="ink-select-item ink-menu-item ink-signature-create"
        data-ink-select-item=""
        data-ink-signature-create=""
        onClick={onCreate}
      >
        <InkIcon icon={Plus} size={16} />
        {SIGNATURE_LABELS.create}
      </button>
      {removeError ? (
        <p
          className="ink-field-error ink-signature-remove-error"
          role="alert"
          data-ink-signature-remove-error=""
        >
          {removeError}
        </p>
      ) : null}
    </>
  )
}
