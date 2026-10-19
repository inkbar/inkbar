/*
 * A split button for the signature tool. The main part activates the tool with the chosen
 * signature, or opens the menu when none is chosen; the chevron opens the saved signatures as
 * previews, each with a remove button, and "Create signature", which opens
 * `InkSignatureDialog`. Choosing a signature switches to the tool with it.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  menuItems,
  SIGNATURE_LABELS,
  signatureMenuModel,
  signaturePreview,
} from '@inkbar/core/dom'
import { ChevronDown, Plus, Signature, Trash2 } from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useTool } from '../hooks/useTool'
import { useToolOptions } from '../hooks/useToolOptions'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'
import { InkSignatureDialog } from './InkSignatureDialog'

import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

export interface InkSignatureMenuProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Replaces the main button's icon. */
  children?: ReactNode
  /** The fonts the dialog's Type tab offers. Default: InkRoot's `signatureFonts`. */
  fonts?: readonly string[] | undefined
}

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

export function InkSignatureMenu({
  className,
  children,
  fonts,
  ...rest
}: InkSignatureMenuProps) {
  const { tool, setTool } = useTool()
  const [options, setOptions] = useToolOptions<SignatureOptions>('signature')
  const { signatures } = useInkContext('InkSignatureMenu')
  const templates = useReadable(signatures.templates, NO_TEMPLATES)
  const removeError = useReadable(signatures.removeError, undefined)
  const model = signatureMenuModel(templates, options)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const active = tool === 'signature'
  const main = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  /** Set while the menu closes for the dialog, which takes focus instead of the trigger. */
  const toDialog = useRef(false)
  /** The row of a removed signature, until focus lands on what took its place. */
  const removedRow = useRef<number | null>(null)

  // An old removal error is not news when the menu opens again.
  useEffect(() => {
    if (open) signatures.clearRemoveError()
  }, [open, signatures])

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
  }, [templates])

  const remove = (id: string, row: number): void => {
    // Set first: the list may re-render before the removal's promise settles.
    removedRow.current = row
    signatures.remove(id).catch(() => {
      // The host's store refused: the signature stays.
      removedRow.current = null
    })
  }

  return (
    <div
      role="group"
      aria-label={SIGNATURE_LABELS.sign}
      className={cx('ink-split-button ink-signature-menu', className)}
      data-ink-signature-menu=""
      {...rest}
    >
      <Toolbar.Button
        ref={main}
        className="ink-tool-button ink-signature-button"
        data-ink-tool-button=""
        data-ink-signature-button=""
        data-tool="signature"
        data-state={active ? 'on' : 'off'}
        aria-pressed={active}
        aria-label={SIGNATURE_LABELS.sign}
        title={SIGNATURE_LABELS.sign}
        onClick={() => {
          if (model.selected) setTool('signature')
          else setOpen(true)
        }}
      >
        {children ?? <InkIcon icon={Signature} />}
      </Toolbar.Button>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Toolbar.Button asChild>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="ink-menu-trigger ink-signature-menu-trigger"
              data-ink-signature-menu-trigger=""
              data-state={open ? 'open' : 'closed'}
              aria-label={SIGNATURE_LABELS.trigger}
              title={SIGNATURE_LABELS.trigger}
              aria-haspopup="menu"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' || e.defaultPrevented || open) return
                e.preventDefault()
                focusFirst.current = true
                setOpen(true)
              }}
            >
              <InkIcon icon={ChevronDown} />
            </button>
          </Popover.Trigger>
        </Toolbar.Button>
        <Popover.Portal>
          <Popover.Content
            ref={menu}
            role="menu"
            aria-label={SIGNATURE_LABELS.menu}
            className="ink-select-content ink-menu-content"
            data-ink-select-content=""
            data-ink-menu="signature"
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const el = e.currentTarget as HTMLElement
              if (focusFirst.current) menuItems(el)[0]?.focus({ preventScroll: true })
              else focusInitialMenuItem(el)
              focusFirst.current = false
            }}
            onCloseAutoFocus={(e) => {
              if (toDialog.current) e.preventDefault()
              toDialog.current = false
            }}
            onKeyDown={(e) => handleMenuKeys(e.nativeEvent, e.currentTarget)}
          >
            {model.items.length > 0 ? (
              <>
                <div
                  role="group"
                  aria-label={SIGNATURE_LABELS.saved}
                  className="ink-signature-list"
                  data-ink-menu-columns={2}
                >
                  {model.items.map((item, row) => [
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
                      onClick={() => {
                        setOptions({ templateId: item.id })
                        setTool('signature')
                        setOpen(false)
                      }}
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
              onClick={() => {
                toDialog.current = true
                setOpen(false)
                setCreating(true)
              }}
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <InkSignatureDialog
        open={creating}
        onOpenChange={setCreating}
        fonts={fonts}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          main.current?.focus({ preventScroll: true })
        }}
      />
    </div>
  )
}
