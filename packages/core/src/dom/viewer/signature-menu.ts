/*
 * The signature menu for createViewer: a split button with the same markup, classes and data
 * attributes as the bindings' `InkSignatureMenu`, so `@inkbar/theme` styles both. The main
 * button activates the signature tool with the chosen template (or opens the menu when none is
 * chosen); the chevron opens the saved signatures, each with a remove button, and "Create
 * signature", which opens the signature dialog.
 */
import { ChevronDown, Plus, Signature, Trash2 } from '@inkbar/icons'

import { signaturePreview } from '../signature-pad'
import { SIGNATURE_LABELS, signatureMenuModel, type SignatureMenuModel } from '../ui'

import { createIcon } from './controls'
import { h } from './dom'
import { createMenu } from './menu'
import { createSignatureDialog, type SignatureDialogOptions } from './signature-dialog'

import type { Viewer } from './create-viewer'
import type { SignatureLibrary, SignatureTemplate } from '../../model/signatures'
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
  /** The ids the open panel shows, to rebuild it only when the list changes. */
  let shown = ''

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

  /** Removes a template; focus moves to the signature now in its row, else "Create signature". */
  function remove(panel: HTMLElement, id: string): void {
    const row = model().items.findIndex((i) => i.id === id)
    library?.remove(id).then(
      () => {
        if (!menu.isOpen) return
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

  function paint(panel: HTMLElement, m: SignatureMenuModel): void {
    const ids = m.items.map((i) => i.id).join(' ')
    // A fresh panel is a fresh opening: an old removal error is not news any more.
    if (panel.childElementCount === 0) library?.clearRemoveError()
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
        choose.addEventListener('click', () => {
          tools?.set('signature', { templateId: item.id })
          menu.close(true)
        })
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
      create.addEventListener('click', () => {
        menu.close()
        dialog.open({ returnFocus: main })
      })
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
    const message = library?.removeError.get()
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

  const menu = createMenu(trigger, {
    label: SIGNATURE_LABELS.menu,
    attrs: { 'data-ink-menu': 'signature' },
    render: (panel) => paint(panel, model()),
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
