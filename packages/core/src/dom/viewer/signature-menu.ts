/*
 * The signature menu for createViewer: a split button with the same markup, classes and data
 * attributes as the bindings' `InkSignatureMenu`, so `@inkbar/theme` styles both. The main
 * button activates the signature tool with the chosen template (or opens the menu when none is
 * chosen); the chevron opens the saved signatures, each with a remove button, and "Create
 * signature", which opens the signature dialog.
 *
 * The same menu signs a signature field (`createSignFieldMenu`): anchored to the field's box,
 * picking a signature, or creating one, signs the field with it.
 */
import { ChevronDown, Plus, Signature, Trash2 } from '@inkbar/icons'

import { isInkError, type InkError } from '../../model/errors'
import { signField } from '../../model/form/sign'
import { signaturePreview } from '../signature-pad'
import { SIGNATURE_LABELS, signatureMenuModel, type SignatureMenuModel } from '../ui'

import { createIcon } from './controls'
import { h } from './dom'
import { createMenu, type Menu } from './menu'
import { createSignatureDialog, type SignatureDialogOptions } from './signature-dialog'

import type { Viewer } from './create-viewer'
import type { SignatureLibrary, SignatureTemplate } from '../../model/signatures'
import type { SignFieldRequest } from '../form-layer'
import type { ToolController } from '../tools'
import type { ViewerEngine } from '../viewer-engine'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A template drawn small: ink as an SVG of filled outlines, an image as an `<img>`. */
export function createSignaturePreview(t: SignatureTemplate): HTMLElement {
  const box = h('span', { class: 'ink-signature-preview', 'data-kind': t.kind })
  if (t.kind === 'image') {
    box.append(h('img', { src: t.imagedata, alt: '', draggable: 'false' }))
    return box
  }
  const { viewBox, paths } = signaturePreview(t)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'currentColor')
    svg.append(path)
  }
  box.append(svg)
  return box
}

interface SignatureMenuContent {
  /** Builds the panel on first call and updates it in place after. */
  paint(panel: HTMLElement): void
}

/**
 * The saved signatures, each with a remove button, then "Create signature": the panel both
 * signature menus show. `choose` and `create` are the menu's own.
 */
function signatureMenuContent(opts: {
  library: () => SignatureLibrary | null
  model: () => SignatureMenuModel
  choose: (t: SignatureTemplate) => void
  create: () => void
  isOpen: () => boolean
}): SignatureMenuContent {
  const { library, model } = opts
  /** The ids the open panel shows, to rebuild it only when the list changes. */
  let shown = ''

  /** Removes a template; focus moves to the signature now in its row, else "Create signature". */
  function remove(panel: HTMLElement, id: string): void {
    const row = model().items.findIndex((i) => i.id === id)
    library()
      ?.remove(id)
      .then(
        () => {
          if (!opts.isOpen()) return
          const rows = panel.querySelectorAll<HTMLElement>('.ink-signature-item')
          const next =
            rows[Math.min(row, rows.length - 1)] ??
            panel.querySelector<HTMLElement>('[data-ink-signature-create]')
          next?.focus({ preventScroll: true })
        },
        () => {
          // The store refused: the row stays, and `removeError` shows in the menu.
        }
      )
  }

  function paint(panel: HTMLElement): void {
    const m = model()
    const ids = m.items.map((i) => i.id).join(' ')
    // A fresh panel is a fresh opening: an old removal error is not news any more.
    if (panel.childElementCount === 0) library()?.clearRemoveError()
    if (panel.childElementCount === 0 || ids !== shown) {
      shown = ids
      const list = h('div', {
        role: 'group',
        'aria-label': SIGNATURE_LABELS.saved,
        class: 'ink-signature-list',
        'data-ink-menu-columns': '2',
      })
      for (const item of m.items) {
        const choose = h('button', {
          type: 'button',
          role: 'menuitemradio',
          class: 'ink-select-item ink-menu-item ink-signature-item',
          'data-ink-select-item': '',
          'data-key': item.id,
          'aria-label': item.label,
          tabindex: '-1',
        })
        choose.append(createSignaturePreview(item.template))
        choose.addEventListener('click', () => opts.choose(item.template))
        const drop = h('button', {
          type: 'button',
          role: 'menuitem',
          class: 'ink-menu-item ink-signature-remove',
          'data-ink-signature-remove': '',
          'data-key': item.id,
          'aria-label': item.removeLabel,
          title: item.removeLabel,
          tabindex: '-1',
        })
        drop.append(createIcon(Trash2))
        drop.addEventListener('click', () => remove(panel, item.id))
        list.append(choose, drop)
      }
      const create = h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'ink-select-item ink-menu-item ink-signature-create',
          'data-ink-select-item': '',
          'data-ink-signature-create': '',
          tabindex: '-1',
        },
        SIGNATURE_LABELS.create
      )
      create.prepend(createIcon(Plus))
      create.addEventListener('click', () => opts.create())
      panel.replaceChildren(
        ...(m.items.length > 0
          ? [list, h('div', { role: 'separator', class: 'ink-select-separator' })]
          : []),
        create,
        h('p', {
          class: 'ink-field-error ink-signature-remove-error',
          role: 'alert',
          'data-ink-signature-remove-error': '',
        })
      )
    }
    const error = panel.querySelector<HTMLElement>('[data-ink-signature-remove-error]')!
    const message = library()?.removeError.get()
    error.textContent = message ?? ''
    error.hidden = message === undefined
    for (const item of m.items) {
      const el = panel.querySelector<HTMLElement>(
        `.ink-signature-item[data-key="${CSS.escape(item.id)}"]`
      )
      el?.setAttribute('aria-checked', String(item.checked))
      if (el) el.dataset.state = item.checked ? 'checked' : 'unchecked'
    }
  }

  return { paint }
}

export function createSignatureMenu(
  viewer: Viewer,
  opts: SignatureDialogOptions = {}
): HTMLElement {
  const main = h('button', {
    type: 'button',
    class: 'ink-tool-button ink-signature-button',
    'data-ink-tool-button': '',
    'data-ink-signature-button': '',
    'data-tool': 'signature',
    'data-state': 'off',
    'aria-pressed': 'false',
    'aria-label': SIGNATURE_LABELS.sign,
    title: SIGNATURE_LABELS.sign,
  })
  main.append(createIcon(Signature))
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-signature-menu-trigger',
    'data-ink-signature-menu-trigger': '',
    'data-state': 'closed',
    'aria-label': SIGNATURE_LABELS.trigger,
    title: SIGNATURE_LABELS.trigger,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  trigger.append(createIcon(ChevronDown))
  const root = h(
    'div',
    {
      class: 'ink-split-button ink-signature-menu',
      'data-ink-signature-menu': '',
      role: 'group',
      'aria-label': SIGNATURE_LABELS.sign,
    },
    main,
    trigger
  )
  main.disabled = true
  trigger.disabled = true

  const dialog = createSignatureDialog(viewer, opts)
  let tools: ToolController | null = null
  let library: SignatureLibrary | null = null
  let stops: (() => void)[] = []

  const model = (): SignatureMenuModel =>
    signatureMenuModel(
      library?.templates.get() ?? [],
      tools?.options('signature').get() ?? {}
    )

  function refresh(): void {
    main.disabled = trigger.disabled = tools === null
    const on = tools?.active.get() === 'signature'
    main.dataset.state = on ? 'on' : 'off'
    main.setAttribute('aria-pressed', String(on))
    menu.refresh()
  }

  const content = signatureMenuContent({
    library: () => library,
    model,
    choose: (t) => {
      tools?.set('signature', { templateId: t.id })
      menu.close(true)
    },
    create: () => {
      menu.close()
      dialog.open({ returnFocus: main })
    },
    isOpen: () => menu.isOpen,
  })
  const menu = createMenu(trigger, {
    label: SIGNATURE_LABELS.menu,
    anchor: root,
    attrs: { 'data-ink-menu': 'signature' },
    render: (panel) => content.paint(panel),
  })

  main.addEventListener('click', () => {
    if (!tools) return
    if (model().selected) tools.set('signature')
    else trigger.click()
  })

  const follow = (next: ToolController | null): void => {
    for (const stop of stops) stop()
    stops = []
    tools = next
    if (tools)
      stops = [
        tools.active.subscribe(refresh),
        tools.options('signature').subscribe(refresh),
      ]
    if (!tools) {
      menu.close()
      dialog.close()
    }
    refresh()
  }
  // The library lives as long as the viewer, but reaches the menu with the first engine.
  let stopLibrary: () => void = () => undefined
  const followLibrary = (engine: ViewerEngine | null): void => {
    const next = engine?.signatures ?? null
    if (next === library) return
    stopLibrary()
    library = next
    const stops = library
      ? [library.templates.subscribe(refresh), library.removeError.subscribe(refresh)]
      : []
    stopLibrary = () => stops.forEach((stop) => stop())
    refresh()
  }
  follow(viewer.tools.get())
  viewer.tools.subscribe(follow)
  followLibrary(viewer.engine.get())
  viewer.engine.subscribe(followLibrary)
  return root
}

/** Options for `createSignFieldMenu`. */
export interface SignFieldMenuOptions extends SignatureDialogOptions {
  /** Signing failed: the field was read-only by then, or already signed. */
  onError?(error: InkError): void
}

/** The signature menu for signature fields; see `createSignFieldMenu`. */
export interface SignFieldMenu {
  /** Opens the menu anchored to the field's box. Another field's open menu closes. */
  open(req: SignFieldRequest): void
  close(): void
  destroy(): void
}

/**
 * The signature menu, opened on a signature field (the engine's `onSignField`). It lists the
 * saved signatures and "Create signature", as the toolbar's menu does. Picking one signs the
 * field with it (`signField`); a new one from the dialog signs the field once saved. Focus
 * returns to the field.
 */
export function createSignFieldMenu(
  viewer: Viewer,
  opts: SignFieldMenuOptions = {}
): SignFieldMenu {
  const dialog = createSignatureDialog(viewer, opts)
  let menu: Menu | null = null
  let destroyed = false

  const library = (): SignatureLibrary | null => viewer.engine.get()?.signatures ?? null
  const close = (): void => {
    menu?.close()
    menu = null
  }

  /** Signs the request's field with `t`, reporting a refusal. */
  const sign = (req: SignFieldRequest, t: SignatureTemplate): void => {
    const doc = viewer.document.get()
    if (!doc) return
    try {
      signField(doc, req.field, req.widget, t)
    } catch (e) {
      if (!isInkError(e)) throw e
      opts.onError?.(e)
    }
  }

  let stopLibrary: () => void = () => undefined
  const followLibrary = (engine: ViewerEngine | null): void => {
    stopLibrary()
    const lib = engine?.signatures
    const stops = lib
      ? [
          lib.templates.subscribe(() => menu?.refresh()),
          lib.removeError.subscribe(() => menu?.refresh()),
        ]
      : []
    stopLibrary = () => stops.forEach((stop) => stop())
    if (!engine) {
      close()
      dialog.close()
    }
  }
  followLibrary(viewer.engine.get())
  const stopEngine = viewer.engine.subscribe(followLibrary)

  return {
    open(req) {
      if (destroyed || !viewer.engine.get()) return
      close()
      const control = req.anchor.querySelector<HTMLButtonElement>(
        'button.ink-form-control'
      )
      if (!control) return
      const model = (): SignatureMenuModel =>
        signatureMenuModel(library()?.templates.get() ?? [], {})
      let own: Menu | null = null
      const content = signatureMenuContent({
        library,
        model,
        choose: (t) => {
          own?.close(true)
          sign(req, t)
        },
        create: () => {
          own?.close()
          dialog.open({ returnFocus: control, onSave: (t) => sign(req, t) })
        },
        isOpen: () => own?.isOpen === true,
      })
      own = createMenu(control, {
        label: SIGNATURE_LABELS.menu,
        anchor: req.anchor,
        manual: true,
        attrs: { 'data-ink-menu': 'signature', 'data-ink-sign-field-menu': req.field },
        render: (panel) => content.paint(panel),
        // The field's button is a menu trigger only while its menu is open.
        onClose: () => {
          control.removeAttribute('aria-expanded')
          delete control.dataset.state
        },
      })
      menu = own
      own.open()
    },
    close,
    destroy() {
      if (destroyed) return
      destroyed = true
      close()
      dialog.destroy()
      stopEngine()
      stopLibrary()
    },
  }
}
