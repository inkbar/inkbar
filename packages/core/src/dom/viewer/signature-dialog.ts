/*
 * The "Create signature" dialog for createViewer, with the same markup, classes and data
 * attributes as the bindings' `InkSignatureDialog`, so `@inkbar/theme` styles both. A modal:
 * Tab stays inside it, Escape or a press on the overlay closes it, and focus goes back where it
 * came from. Draw, Type and Image tabs each make a template; Save stores it in the viewer's
 * signature library and selects it for the `signature` tool.
 */
import { handleRadioKeys, handleTabKeys, trapTab } from '../menu-keys'
import { createSignatureDraft, type SignatureDraftState } from '../signature-draft'
import { fontFamilyValue } from '../signature-pad'
import {
  SIGNATURE_FONTS,
  SIGNATURE_LABELS,
  SIGNATURE_TABS,
  type SignatureTab,
} from '../ui'

import { h } from './dom'

import type { Viewer } from './create-viewer'
import type { SignatureTemplate } from '../../model/signatures'

export interface SignatureDialogOptions {
  /** The fonts the Type tab offers. Default: the viewer's `signatureFonts`. */
  fonts?: string[]
}

export interface SignatureDialog {
  readonly isOpen: boolean
  /**
   * Opens the dialog. On close, focus goes to `returnFocus`, else to what had it before. Save
   * stores the template and selects it for the `signature` tool, or, with `onSave`, hands it
   * to `onSave` instead (to sign a form field with it).
   */
  open(opts?: {
    returnFocus?: HTMLElement | null
    onSave?: (t: SignatureTemplate) => void
  }): void
  close(): void
  destroy(): void
}

let dialogs = 0

export function createSignatureDialog(
  viewer: Viewer,
  opts: SignatureDialogOptions = {}
): SignatureDialog {
  const uid = `ink-signature-dialog-${++dialogs}`
  let teardown: (() => void) | null = null

  function close(): void {
    teardown?.()
    teardown = null
  }

  function open(
    o: { returnFocus?: HTMLElement | null; onSave?: (t: SignatureTemplate) => void } = {}
  ): void {
    if (teardown) return
    const returnTo =
      o.returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const draft = createSignatureDraft({
      fonts: opts.fonts ?? viewer.engine.get()?.signatureFonts ?? SIGNATURE_FONTS,
    })

    const tabs = new Map<SignatureTab, HTMLButtonElement>()
    const panels = new Map<SignatureTab, HTMLElement>()
    const tablist = h('div', {
      role: 'tablist',
      'aria-label': SIGNATURE_LABELS.tabs,
      class: 'ink-tabs',
    })
    for (const tab of SIGNATURE_TABS) {
      const b = h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `${uid}-tab-${tab}`,
          'aria-controls': `${uid}-panel-${tab}`,
          class: 'ink-tab',
          'data-key': tab,
        },
        SIGNATURE_LABELS[tab]
      )
      b.addEventListener('click', () => draft.setTab(tab))
      tabs.set(tab, b)
      tablist.append(b)
      panels.set(
        tab,
        h('div', {
          role: 'tabpanel',
          id: `${uid}-panel-${tab}`,
          'aria-labelledby': `${uid}-tab-${tab}`,
          class: 'ink-tab-panel',
          'data-key': tab,
        })
      )
    }
    tablist.addEventListener('keydown', (e) => handleTabKeys(e, tablist))

    // Draw
    const padHost = h('div', {
      class: 'ink-signature-pad-host',
      'data-ink-signature-pad-host': '',
      role: 'img',
      'aria-label': SIGNATURE_LABELS.pad,
    })
    const clear = h(
      'button',
      { type: 'button', class: 'ink-button', 'data-ink-signature-clear': '' },
      SIGNATURE_LABELS.clear
    )
    clear.addEventListener('click', () => draft.clearPad())
    panels.get('draw')!.append(padHost, h('div', { class: 'ink-dialog-row' }, clear))
    const detachPad = draft.attachPad(padHost)

    // Type
    const name = h('input', {
      type: 'text',
      class: 'ink-input',
      'data-ink-signature-name': '',
      autocomplete: 'name',
      placeholder: SIGNATURE_LABELS.namePlaceholder,
    })
    name.addEventListener('input', () => draft.setName(name.value))
    const fontGroup = h('div', {
      role: 'radiogroup',
      'aria-label': SIGNATURE_LABELS.fonts,
      class: 'ink-signature-fonts',
    })
    const fontSamples = draft.fonts.map((font) => {
      const b = h('button', {
        type: 'button',
        role: 'radio',
        class: 'ink-signature-font',
        'data-key': font,
        'aria-label': font,
      })
      const sample = h('span', { class: 'ink-signature-font-sample' })
      // The font is the option itself, so it is set on the element, not left to the theme.
      sample.style.fontFamily = fontFamilyValue(font)
      b.append(sample)
      b.addEventListener('click', () => draft.setFont(font))
      fontGroup.append(b)
      return sample
    })
    fontGroup.addEventListener('keydown', (e) => handleRadioKeys(e, fontGroup))
    panels
      .get('type')!
      .append(
        h('label', { class: 'ink-field' }, h('span', {}, SIGNATURE_LABELS.name), name),
        fontGroup
      )

    // Image
    const file = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg',
      class: 'ink-input',
      'data-ink-signature-file': '',
    })
    file.addEventListener('change', () => void draft.chooseFile(file.files?.[0]))
    const preview = h('img', { class: 'ink-signature-image', alt: '' })
    const imageError = h('p', { class: 'ink-field-error', role: 'alert' })
    panels
      .get('image')!
      .append(
        h('label', { class: 'ink-field' }, h('span', {}, SIGNATURE_LABELS.file), file),
        preview,
        imageError
      )

    // Actions
    const saveError = h('p', {
      class: 'ink-field-error',
      role: 'alert',
      'data-ink-signature-save-error': '',
    })
    const cancel = h(
      'button',
      { type: 'button', class: 'ink-button', 'data-ink-signature-cancel': '' },
      SIGNATURE_LABELS.cancel
    )
    cancel.addEventListener('click', () => close())
    const save = h(
      'button',
      {
        type: 'button',
        class: 'ink-button',
        'data-variant': 'primary',
        'data-ink-signature-save': '',
      },
      SIGNATURE_LABELS.save
    )
    save.addEventListener('click', () => {
      const library = viewer.engine.get()?.signatures
      if (!library) return
      draft.save(library).then(
        (t) => {
          if (!t) return
          if (o.onSave) {
            close()
            o.onSave(t)
            return
          }
          viewer.tools.get()?.set('signature', { templateId: t.id })
          close()
        },
        () => {
          // The host's store refused it: the dialog stays open to try again.
        }
      )
    })

    const title = h(
      'h2',
      { id: `${uid}-title`, class: 'ink-dialog-title' },
      SIGNATURE_LABELS.dialog
    )
    const content = h(
      'div',
      {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': `${uid}-title`,
        class: 'ink-dialog ink-signature-dialog',
        'data-ink-signature-dialog': '',
        'data-state': 'open',
        tabindex: '-1',
      },
      title,
      tablist,
      ...panels.values(),
      saveError,
      h('div', { class: 'ink-dialog-actions' }, cancel, save)
    )
    const overlay = h('div', {
      class: 'ink-dialog-overlay',
      'data-ink-dialog-overlay': '',
      'data-state': 'open',
    })
    overlay.addEventListener('pointerdown', () => close())

    const paint = (s: SignatureDraftState): void => {
      for (const [tab, b] of tabs) {
        const on = tab === s.tab
        b.setAttribute('aria-selected', String(on))
        b.dataset.state = on ? 'active' : 'inactive'
        b.tabIndex = on ? 0 : -1
        panels.get(tab)!.hidden = !on
      }
      clear.disabled = s.padEmpty
      draft.fonts.forEach((font, i) => {
        const sample = fontSamples[i]!
        const b = sample.parentElement!
        const on = font === s.font
        b.setAttribute('aria-checked', String(on))
        b.dataset.state = on ? 'checked' : 'unchecked'
        b.tabIndex = on ? 0 : -1
        sample.textContent = s.name.trim() || SIGNATURE_LABELS.namePlaceholder
      })
      if (s.image?.kind === 'image') {
        preview.src = s.image.imagedata
        preview.hidden = false
      } else {
        preview.removeAttribute('src')
        preview.hidden = true
      }
      imageError.textContent = s.imageError ?? ''
      imageError.hidden = s.imageError === undefined
      saveError.textContent = s.saveError ?? ''
      saveError.hidden = s.saveError === undefined
      save.disabled = !s.canSave || !viewer.engine.get()
    }
    const stopState = draft.state.subscribe(paint)
    paint(draft.state.get())

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      }
      trapTab(e, content)
    }
    // Focus that escapes (a click on the page behind) comes back in.
    const onFocus = (e: FocusEvent): void => {
      if (!content.contains(e.target as Node)) tabs.get(draft.state.get().tab)?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    document.body.append(overlay, content)
    tabs.get('draw')!.focus({ preventScroll: true })

    teardown = () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      stopState()
      detachPad()
      draft.destroy()
      overlay.remove()
      content.remove()
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    }
  }

  return {
    get isOpen() {
      return teardown !== null
    },
    open,
    close,
    destroy: close,
  }
}
