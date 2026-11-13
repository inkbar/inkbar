/*
 * "Create signature": a modal with Draw, Type and Image tabs. Draw is a pad with the draw
 * tool's renderer; Type sets a name in one of the host's handwriting fonts; Image takes a PNG
 * or JPEG scan. Save stores the template through InkRoot's signature store and, unless `select`
 * is false or no `signature` tool is registered, selects it for that tool. Escape, Cancel or a
 * press outside closes it.
 */
import {
  createSignatureDraft,
  fontFamilyValue,
  handleRadioKeys,
  handleTabKeys,
  SIGNATURE_TABS,
  type SignatureDraft,
  type SignatureDraftState,
  type SignatureTab,
} from '@inkbar/core/dom'
import { Dialog } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useMessages } from '../hooks/useMessages'
import { useHasTool } from '../hooks/useRegisteredTool'
import { useTool } from '../hooks/useTool'
import { useReadable } from '../use-readable'

import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

export interface InkSignatureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The fonts the Type tab offers. Default: InkRoot's `signatureFonts`. */
  fonts?: readonly string[] | undefined
  /**
   * Whether saving selects the new signature for the `signature` tool, when one is registered.
   * Default true. False leaves the tool alone, for a dialog that signs a field with it through
   * `onSave`.
   */
  select?: boolean | undefined
  /** Called with the new template once it is saved (and selected, with `select`). */
  onSave?: ((template: SignatureTemplate) => void) | undefined
  /** Where focus goes on close; by default, back to what had it before. */
  onCloseAutoFocus?: ((event: Event) => void) | undefined
  className?: string | undefined
}

export function InkSignatureDialog({
  open,
  onOpenChange,
  fonts,
  select = true,
  onSave,
  onCloseAutoFocus,
  className,
}: InkSignatureDialogProps) {
  const m = useMessages()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ink-dialog-overlay" data-ink-dialog-overlay="" />
        <Dialog.Content
          className={cx('ink-dialog ink-signature-dialog', className)}
          data-ink-signature-dialog=""
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement)
              .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
              ?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <Dialog.Title className="ink-dialog-title">{m.signature.dialog}</Dialog.Title>
          <SignatureForm
            fonts={fonts}
            select={select}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const IDLE: SignatureDraftState = {
  tab: 'draw',
  padEmpty: true,
  name: '',
  font: '',
  image: undefined,
  imageError: undefined,
  saveError: undefined,
  canSave: false,
  saving: false,
}

/** The dialog's body, mounted while it is open: one draft per opening. */
function SignatureForm({
  fonts,
  select,
  onSave,
  onClose,
}: {
  fonts: readonly string[] | undefined
  select: boolean
  onSave: ((t: SignatureTemplate) => void) | undefined
  onClose: () => void
}) {
  const ctx = useInkContext('InkSignatureDialog')
  const m = ctx.messages
  const { setTool } = useTool()
  // Without the signature tool, Save only stores the template, as signing a form field needs;
  // its options are never read, which would log the missing tool.
  const hasSignatureTool = useHasTool('signature')
  const [draft] = useState<SignatureDraft>(() =>
    // The draft's errors are in the root's words, and follow them.
    createSignatureDraft({
      fonts: fonts ?? ctx.signatureFonts,
      messages: ctx.messageState,
    })
  )
  const s = useReadable(draft.state, IDLE)
  const uid = useId()
  const padHost = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = padHost.current
    const detach = host ? draft.attachPad(host) : undefined
    return () => {
      detach?.()
      draft.destroy()
    }
  }, [draft])

  const save = (): void => {
    draft.save(ctx.signatures).then(
      (t) => {
        if (!t) return
        if (select && hasSignatureTool) {
          const patch: Partial<SignatureOptions> = { templateId: t.id }
          ctx.tools?.setOptions('signature', patch)
          setTool('signature')
        }
        onSave?.(t)
        onClose()
      },
      () => {
        // The host's store refused it: the dialog stays open to try again.
      }
    )
  }

  const tabId = (tab: SignatureTab) => `${uid}-tab-${tab}`
  const panelId = (tab: SignatureTab) => `${uid}-panel-${tab}`
  const panel = (tab: SignatureTab) => ({
    role: 'tabpanel',
    id: panelId(tab),
    'aria-labelledby': tabId(tab),
    className: 'ink-tab-panel',
    'data-key': tab,
    hidden: s.tab !== tab,
  })
  const shown = s.name.trim() || m.signature.namePlaceholder

  return (
    <>
      <div
        role="tablist"
        aria-label={m.signature.tabs}
        className="ink-tabs"
        onKeyDown={(e) => handleTabKeys(e.nativeEvent, e.currentTarget)}
      >
        {SIGNATURE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-controls={panelId(tab)}
            aria-selected={s.tab === tab}
            tabIndex={s.tab === tab ? 0 : -1}
            className="ink-tab"
            data-key={tab}
            data-state={s.tab === tab ? 'active' : 'inactive'}
            onClick={() => draft.setTab(tab)}
          >
            {m.signature[tab]}
          </button>
        ))}
      </div>
      <div {...panel('draw')}>
        <div
          ref={padHost}
          className="ink-signature-pad-host"
          data-ink-signature-pad-host=""
          role="img"
          aria-label={m.signature.pad}
        />
        <div className="ink-dialog-row">
          <button
            type="button"
            className="ink-button"
            data-ink-signature-clear=""
            disabled={s.padEmpty}
            onClick={() => draft.clearPad()}
          >
            {m.signature.clear}
          </button>
        </div>
      </div>
      <div {...panel('type')}>
        <label className="ink-field">
          <span>{m.signature.name}</span>
          <input
            type="text"
            className="ink-input"
            data-ink-signature-name=""
            autoComplete="name"
            placeholder={m.signature.namePlaceholder}
            value={s.name}
            onChange={(e) => draft.setName(e.target.value)}
          />
        </label>
        <div
          role="radiogroup"
          aria-label={m.signature.fonts}
          className="ink-signature-fonts"
          onKeyDown={(e) => handleRadioKeys(e.nativeEvent, e.currentTarget)}
        >
          {draft.fonts.map((font) => (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={s.font === font}
              aria-label={font}
              tabIndex={s.font === font ? 0 : -1}
              className="ink-signature-font"
              data-key={font}
              data-state={s.font === font ? 'checked' : 'unchecked'}
              onClick={() => draft.setFont(font)}
            >
              {/* The font is the option itself, so it is set here, not left to the theme. */}
              <span
                className="ink-signature-font-sample"
                style={{ fontFamily: fontFamilyValue(font) }}
              >
                {shown}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div {...panel('image')}>
        <label className="ink-field">
          <span>{m.signature.file}</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="ink-input"
            data-ink-signature-file=""
            onChange={(e) => void draft.chooseFile(e.target.files?.[0])}
          />
        </label>
        {s.image?.kind === 'image' ? (
          <img className="ink-signature-image" src={s.image.imagedata} alt="" />
        ) : null}
        {s.imageError ? (
          <p className="ink-field-error" role="alert">
            {s.imageError}
          </p>
        ) : null}
      </div>
      {s.saveError ? (
        <p className="ink-field-error" role="alert" data-ink-signature-save-error="">
          {s.saveError}
        </p>
      ) : null}
      <div className="ink-dialog-actions">
        <Dialog.Close asChild>
          <button type="button" className="ink-button" data-ink-signature-cancel="">
            {m.signature.cancel}
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="ink-button"
          data-variant="primary"
          data-ink-signature-save=""
          disabled={!s.canSave}
          onClick={save}
        >
          {m.signature.save}
        </button>
      </div>
    </>
  )
}
