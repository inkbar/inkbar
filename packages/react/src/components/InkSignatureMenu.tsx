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
  signatureMenuModel,
} from '@inkbar/core/dom'
import { ChevronDown, Signature } from '@inkbar/icons'
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
import { useRegisteredTool } from '../hooks/useRegisteredTool'
import { useTool } from '../hooks/useTool'
import { useToolOptions } from '../hooks/useToolOptions'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'
import { InkSignatureDialog } from './InkSignatureDialog'
import { SignatureMenuPanel } from './SignatureMenuPanel'

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

/** Renders nothing while no `signature` tool is registered. */
export function InkSignatureMenu(props: InkSignatureMenuProps) {
  // The inner menu reads the tool's options, which would log a missing tool a second time.
  return useRegisteredTool('signature') ? <SignatureMenu {...props} /> : null
}

function SignatureMenu({ className, children, fonts, ...rest }: InkSignatureMenuProps) {
  const { tool, setTool } = useTool()
  const [options, setOptions] = useToolOptions<SignatureOptions>('signature')
  const { signatures, messages: m } = useInkContext('InkSignatureMenu')
  const templates = useReadable(signatures.templates, NO_TEMPLATES)
  const model = signatureMenuModel(templates, options, m)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const active = tool === 'signature'
  const main = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  /** Set while the menu closes for the dialog, which takes focus instead of the trigger. */
  const toDialog = useRef(false)

  // An old removal error is not news when the menu opens again.
  useEffect(() => {
    if (open) signatures.clearRemoveError()
  }, [open, signatures])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          role="group"
          aria-label={m.signature.sign}
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
            aria-label={m.signature.sign}
            title={m.signature.sign}
            onClick={() => {
              if (model.selected) setTool('signature')
              else setOpen(true)
            }}
          >
            {children ?? <InkIcon icon={Signature} />}
          </Toolbar.Button>
          <Toolbar.Button asChild>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="ink-menu-trigger ink-signature-menu-trigger"
                data-ink-signature-menu-trigger=""
                data-state={open ? 'open' : 'closed'}
                aria-label={m.signature.trigger}
                title={m.signature.trigger}
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
              aria-label={m.signature.menu}
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
              <SignatureMenuPanel
                items={model.items}
                menu={menu}
                onChoose={(t) => {
                  setOptions({ templateId: t.id })
                  setTool('signature')
                  setOpen(false)
                }}
                onCreate={() => {
                  toDialog.current = true
                  setOpen(false)
                  setCreating(true)
                }}
              />
            </Popover.Content>
          </Popover.Portal>
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
      </Popover.Anchor>
    </Popover.Root>
  )
}
