// The page's form fields, as native controls over the canvas.
//
// Inline styles here are structural or geometric: the layer is `position:absolute; inset:0;
// pointer-events:none` over the page, each widget box is `position:absolute` at its rect from
// the transform, and its control is placed and turned inside the box (`/MK /R` and the page's
// turn). What a control looks like when it draws itself (font, size, colour, alignment, border,
// background) is the field's own appearance from the PDF or a script, as an annotation's colours
// are its own. The tint, focus ring and invalid mark are the theme's.
//
// Untouched widgets look exactly as the PDF draws them: the page canvas leaves the widgets out,
// and the layer draws each widget's own appearance into a small canvas over its rect
// (form-appearance.ts). Those canvases sit in the page's stack right above the page canvas,
// under the text layer and the annotations, so annotations over a field stay visible. The layer
// itself sits above the text layer and under the annotations: a press on an annotation's shape
// selects the annotation, and a press anywhere else in a field's box is the field's. A widget's
// control is clear until it is focused or shows something the PDF's appearance does not (a
// changed value, a script's colour or size); then its appearance hides and the control draws.
//
// A signature field is a button: "Sign" while it is empty, which asks the host to sign it
// (`onSignField`), and clear once signed, when the signature annotation shows over it.
//
// A checkbox or radio has both its on and off appearances drawn, and shows the one for its
// state: a toggle, like an edit, paints nothing.
//
// The widget boxes are in the page's Tab order (its `/Tabs`), so Tab within a page is the
// browser's own. A radio group is one stop: its chosen radio, else its first. The engine moves
// Tab on from a page's last stop to the next page's first.
import { sameValue } from '../model/form/values'

import { createWidgetAppearances, type WidgetAppearances } from './form-appearance'
import { createButtonWidget } from './form-button'
import { createChoiceWidget, createToggleWidget } from './form-choice'
import { tabOrder } from './form-order'
import { createSignatureWidget } from './form-signature'
import { createTextWidget } from './form-text'
import { normalizeRotation, type PageTransform, type ViewRotation } from './transform'
import { FORM_LABELS } from './ui'

import type { InkDocument } from '../model/document'
import type { FormController } from '../model/form/controller'
import type {
  FieldValue,
  FormField,
  FormFieldType,
  FormWidget,
  WidgetOverride,
} from '../model/form/types'
import type { Rect } from '../model/geometry'
import type { AppearanceLook } from '../pdfjs/widget-appearance'

/** A signature field asked to be signed, anchored to its widget's box. */
export interface SignFieldRequest {
  /** Full field name. */
  field: string
  /** Widget id. */
  widget: string
  /** Zero-based page index. */
  page: number
  /** The widget's rect, in user space. */
  rect: Rect
  /** The widget's box, to anchor the signature menu to. */
  anchor: HTMLElement
}

export interface FormLayerOptions {
  /** The page host (`div.ink-page`); the layer appends itself to it. */
  host: HTMLElement
  /** Zero-based page index. */
  page: number
  transform: PageTransform
  document: InkDocument
  /** Tints fillable fields. Off sets `data-ink-form-highlight="off"` on the layer. */
  highlight: boolean
  onSignField?(req: SignFieldRequest): void
  /**
   * Whether fields take input now: while the default pointer tool is active. Read on
   * `refresh()` and when the layer is built.
   */
  isActive(): boolean
  /** Device pixel ratio for the widget appearances; `window.devicePixelRatio` when omitted. */
  devicePixelRatio?: number
  /** A widget's appearance failed to render (cancellations are not reported). */
  onError?(error: unknown): void
  /** The widget appearances shown painted. */
  onRendered?(): void
}

export interface FormLayer {
  readonly element: HTMLElement
  /**
   * Resolves once the widget appearances shown now have painted (or failed). Never rejects.
   */
  readonly rendered: Promise<void>
  /** Places every widget for a new zoom or rotation, in place: focus, caret and typed text stay. */
  update(t: PageTransform): void
  /** Focuses the widget's control. False when the widget is not on this page or is hidden. */
  focusWidget(id: string): boolean
  /** The controls Tab stops at, in Tab order: none while fields take no input. */
  tabStops(): HTMLElement[]
  /** Reads `isActive()` again, after the active tool changed. */
  refresh(): void
  destroy(): void
}

/** What a widget shows: the field's value, its formatted text and any script state. */
export interface WidgetState {
  value: FieldValue | undefined
  /** Formatted text from a format script, shown while the widget is not focused. */
  formatted: string | undefined
  override: WidgetOverride
  readOnly: boolean
  required: boolean
}

/** The control's own frame in its box: unturned size, its turn on screen, and the zoom. */
export interface WidgetFrame {
  /** CSS px, before `rotation`. */
  width: number
  height: number
  /** Clockwise turn on screen: the page's total rotation less `/MK /R`. */
  rotation: ViewRotation
  /** CSS px per user-space unit. */
  scale: number
}

/** What the layer gives a widget renderer. */
export interface WidgetViewContext {
  readonly document: InkDocument
  readonly form: FormController
  readonly field: FormField
  readonly widget: FormWidget
  readonly page: number
  /** The widget's box (`[data-ink-widget]`), placed by the layer. The view adds its control. */
  readonly box: HTMLElement
  /** The control's accessible name: `/TU`, else the last part of the field name. */
  readonly label: string
  /** The view's `drawn` may have changed. */
  redraw(): void
  /**
   * The controls of this field's widgets on the page a person can pick (shown and not
   * read-only), in Tab order, this one included.
   */
  siblings(): HTMLElement[]
  /** Marks the widget invalid (a rejected commit) or valid again. */
  setInvalid(invalid: boolean): void
  onSignField?(req: SignFieldRequest): void
}

/** One widget's control, for one field type. */
export interface WidgetView {
  /** The element that takes focus; the layer places and turns it in the box. */
  readonly control: HTMLElement
  /**
   * True while the view draws the widget itself. False shows the PDF's own appearance under a
   * clear control.
   */
  readonly drawn: boolean
  /**
   * The view runs the widget's Mouse Up itself when activated (after any change of value), so
   * the layer does not send one on pointer up.
   */
  readonly activates?: boolean
  /** False keeps the control out of the Tab order (a signed signature field). */
  readonly tabbable?: boolean
  sync(state: WidgetState): void
  /** The control was placed in a new frame (zoom or rotation). */
  layout(frame: WidgetFrame): void
  destroy(): void
}

export type WidgetRenderer = (ctx: WidgetViewContext) => WidgetView

/** The field types the layer draws controls for. Widgets of other types keep their appearance. */
const RENDERERS: Partial<Record<FormFieldType, WidgetRenderer>> = {
  text: (ctx) => createTextWidget(ctx),
  checkbox: createToggleWidget,
  radio: createToggleWidget,
  combo: createChoiceWidget,
  list: createChoiceWidget,
  button: createButtonWidget,
  signature: createSignatureWidget,
}

/** Whether the layer gives the field a control: its type has one and nothing locks it. */
export function hasControl(field: FormField): boolean {
  return !field.locked && RENDERERS[field.type] !== undefined
}

const isToggle = (field: FormField) => field.type === 'checkbox' || field.type === 'radio'

/**
 * The appearances PDF.js has for a widget, by the file's appearance states: none for a widget
 * the file hides; a toggle's on and off looks where `/AP /N` holds them; any other widget's own
 * where the file has an `/AP`.
 */
function expectedLooks(
  field: FormField,
  widget: FormWidget
): ReadonlySet<AppearanceLook> {
  const looks = new Set<AppearanceLook>()
  if (
    widget.hidden ||
    widget.printOnly ||
    widget.rect.width <= 0 ||
    widget.rect.height <= 0
  )
    return looks
  const a = widget.appearance
  if (isToggle(field)) {
    if (a.onAppearance) looks.add('checked')
    if (a.offAppearance) looks.add('unchecked')
  } else if (a.fileAppearance) looks.add('own')
  return looks
}

interface Entry {
  field: FormField
  widget: FormWidget
  box: HTMLElement
  view: WidgetView | undefined
  /** The field's value when last synced, to clear a refused commit's mark once it changes. */
  value: FieldValue | undefined
}

/** A field's accessible name: its tooltip, else the last part of its name. */
function labelOf(field: FormField): string {
  const tip = field.tooltip?.trim()
  if (tip) return tip
  return field.name.split('.').at(-1)?.trim() || FORM_LABELS.unnamed
}

const toggle = (el: Element, attr: string, on: boolean) => {
  if (on) el.setAttribute(attr, '')
  else el.removeAttribute(attr)
}

/** The form fields of one page: a control over each widget of a type the layer fills in. */
export function createFormLayer(opts: FormLayerOptions): FormLayer {
  const { host, page, document: doc } = opts
  const form = doc.form
  const ownerDoc = host.ownerDocument
  let transform = opts.transform
  let destroyed = false

  const element = ownerDoc.createElement('div')
  element.className = 'ink-form-layer'
  element.dataset.inkFormLayer = ''
  element.dataset.inkFormHighlight = opts.highlight ? 'on' : 'off'
  element.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  host.append(element)

  const fields = form.fields.get()
  const order = new Map(tabOrder(fields, form._tabs, doc.pages).map((id, i) => [id, i]))
  const entries: Entry[] = []
  for (const field of fields)
    for (const widget of field.widgets) {
      if (widget.page !== page) continue
      const box = ownerDoc.createElement('div')
      box.className = 'ink-form-widget'
      box.dataset.inkWidget = widget.id
      box.dataset.inkField = field.name
      box.dataset.inkType = field.type
      box.style.cssText = 'position:absolute;pointer-events:none;'
      entries.push({
        field,
        widget,
        box,
        view: undefined,
        value: form.values.get()[field.name],
      })
    }
  entries.sort((a, b) => (order.get(a.widget.id) ?? 0) - (order.get(b.widget.id) ?? 0))
  for (const e of entries) element.append(e.box)

  // The PDF's own widget appearances: right above the page canvas, under the text layer and
  // the annotations.
  let appearances: WidgetAppearances | undefined
  if (entries.length > 0) {
    appearances = createWidgetAppearances({
      host,
      document: doc,
      page,
      transform,
      widgets: entries.map((e) => ({
        id: e.widget.id,
        rect: e.widget.rect,
        toggle: isToggle(e.field),
        expects: expectedLooks(e.field, e.widget),
      })),
      ...(opts.devicePixelRatio === undefined
        ? {}
        : { devicePixelRatio: opts.devicePixelRatio }),
      ...(opts.onError ? { onError: (error: unknown) => opts.onError?.(error) } : {}),
      ...(opts.onRendered ? { onRendered: () => opts.onRendered?.() } : {}),
    })
    const canvasLayer = host.querySelector(':scope > [data-ink-canvas-layer]')
    if (canvasLayer) canvasLayer.after(appearances.element)
    else host.prepend(appearances.element)
  }

  const setInvalid = (e: Entry, invalid: boolean) => {
    toggle(e.box, 'data-ink-invalid', invalid)
    if (invalid) e.view?.control.setAttribute('aria-invalid', 'true')
    else e.view?.control.removeAttribute('aria-invalid')
  }

  const stateOf = (e: Entry): WidgetState => {
    const override = form.widgetState.get()[e.widget.id] ?? {}
    return {
      value: form.values.get()[e.field.name],
      formatted: form.formatted.get()[e.field.name],
      override,
      readOnly: e.field.locked || (override.readOnly ?? e.field.flags.readOnly),
      required: override.required ?? e.field.flags.required,
    }
  }

  const hiddenOf = (e: Entry): boolean =>
    form.widgetState.get()[e.widget.id]?.hidden ?? (e.widget.hidden || e.widget.printOnly)

  /** Shows each widget's own appearance, unless the layer draws it or it is hidden. */
  const showAppearances = () => {
    if (!appearances) return
    const values = form.values.get()
    for (const e of entries) {
      const look =
        e.view?.drawn || hiddenOf(e)
          ? null
          : isToggle(e.field)
            ? e.widget.onState !== undefined && values[e.field.name] === e.widget.onState
              ? 'checked'
              : 'unchecked'
            : 'own'
      appearances.show(e.widget.id, look)
    }
  }

  const place = (e: Entry) => {
    const r = transform.toCssRect(e.widget.rect)
    const s = e.box.style
    s.left = `${r.left}px`
    s.top = `${r.top}px`
    s.width = `${r.width}px`
    s.height = `${r.height}px`
    const view = e.view
    if (!view) return
    const rotation = normalizeRotation(transform.totalRotation - e.widget.rotation)
    const across = rotation === 90 || rotation === 270
    const width = across ? r.height : r.width
    const height = across ? r.width : r.height
    const c = view.control.style
    c.position = 'absolute'
    c.left = `${(r.width - width) / 2}px`
    c.top = `${(r.height - height) / 2}px`
    c.width = `${width}px`
    c.height = `${height}px`
    c.transform = rotation === 0 ? '' : `rotate(${rotation}deg)`
    view.layout({ width, height, rotation, scale: transform.scale })
  }

  const syncEntry = (e: Entry) => {
    const state = stateOf(e)
    // A new value (a commit, a reset, a host's push, a script) clears a refused commit's mark.
    if (!sameValue(state.value, e.value)) {
      e.value = state.value
      setInvalid(e, false)
    }
    e.box.style.display = hiddenOf(e) ? 'none' : ''
    toggle(e.box, 'data-ink-readonly', state.readOnly)
    toggle(e.box, 'data-ink-required', state.required)
    const control = e.view?.control
    if (control) {
      if (state.readOnly) control.setAttribute('aria-readonly', 'true')
      else control.removeAttribute('aria-readonly')
      if (state.required) control.setAttribute('aria-required', 'true')
      else control.removeAttribute('aria-required')
    }
    e.view?.sync(state)
    toggle(e.box, 'data-ink-drawn', e.view?.drawn === true)
  }

  /** A radio group is one Tab stop on the page: its chosen radio, else its first. */
  const isStop = (e: Entry): boolean => {
    if (e.view?.tabbable === false) return false
    if (e.field.type !== 'radio') return true
    const value = form.values.get()[e.field.name]
    const group = entries.filter((g) => g.field === e.field && g.view && !hiddenOf(g))
    return e === (group.find((g) => g.widget.onState === value) ?? group[0])
  }

  /** Numbers each radio group's shown widgets on the page for assistive technology. */
  const numberRadios = () => {
    for (const e of entries) {
      const control = e.view?.control
      if (!control || e.field.type !== 'radio') continue
      const group = entries.filter((g) => g.field === e.field && g.view && !hiddenOf(g))
      const at = group.indexOf(e)
      if (at < 0) {
        control.removeAttribute('aria-posinset')
        control.removeAttribute('aria-setsize')
      } else {
        control.setAttribute('aria-posinset', String(at + 1))
        control.setAttribute('aria-setsize', String(group.length))
      }
    }
  }

  const setActive = () => {
    const active = opts.isActive()
    for (const e of entries) {
      if (!e.view) continue
      e.box.style.pointerEvents = active ? 'auto' : 'none'
      e.view.control.tabIndex = active && isStop(e) ? 0 : -1
    }
  }

  const syncAll = () => {
    if (destroyed) return
    for (const e of entries) syncEntry(e)
    showAppearances()
    numberRadios()
    setActive()
  }

  const listeners: (() => void)[] = []
  const listen = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (ev: HTMLElementEventMap[K]) => void
  ) => {
    el.addEventListener(type, fn)
    listeners.push(() => el.removeEventListener(type, fn))
  }

  for (const e of entries) {
    const box = e.box
    const render = e.field.locked ? undefined : RENDERERS[e.field.type]
    if (render) {
      e.view = render({
        document: doc,
        form,
        field: e.field,
        widget: e.widget,
        page,
        box,
        label: labelOf(e.field),
        redraw: () => {
          if (destroyed) return
          toggle(box, 'data-ink-drawn', e.view?.drawn === true)
          showAppearances()
        },
        setInvalid: (invalid) => setInvalid(e, invalid),
        siblings: () =>
          entries.flatMap((x) =>
            x.field === e.field &&
            x.view &&
            (x === e || (!hiddenOf(x) && !stateOf(x).readOnly))
              ? [x.view.control]
              : []
          ),
        ...(opts.onSignField ? { onSignField: (req) => opts.onSignField?.(req) } : {}),
      })
      listen(box, 'focusin', () => toggle(box, 'data-ink-focused', true))
      listen(box, 'focusout', () => toggle(box, 'data-ink-focused', false))
      if (e.widget.hasScripts) {
        const mouse =
          (name: 'Mouse Enter' | 'Mouse Exit' | 'Mouse Down' | 'Mouse Up') => () => {
            if (opts.isActive()) form._dispatch({ widget: e.widget.id, name })
          }
        listen(box, 'pointerenter', mouse('Mouse Enter'))
        listen(box, 'pointerleave', mouse('Mouse Exit'))
        listen(box, 'pointerdown', mouse('Mouse Down'))
        if (!e.view.activates) listen(box, 'pointerup', mouse('Mouse Up'))
      }
    }
    place(e)
  }
  syncAll()

  const stops = [
    form.values.subscribe(syncAll),
    form.formatted.subscribe(syncAll),
    form.widgetState.subscribe(syncAll),
    form.on('focus', (id) => {
      layer.focusWidget(id)
    }),
  ]

  const layer: FormLayer = {
    element,
    get rendered() {
      return appearances?.rendered ?? Promise.resolve()
    },
    update(next) {
      if (destroyed) return
      transform = next
      appearances?.update(next)
      for (const e of entries) place(e)
    },
    focusWidget(id) {
      const e = entries.find((x) => x.widget.id === id)
      if (destroyed || !e?.view || hiddenOf(e)) return false
      e.view.control.focus()
      return ownerDoc.activeElement === e.view.control
    },
    tabStops() {
      if (destroyed) return []
      return entries.flatMap((e) =>
        e.view && !hiddenOf(e) && e.view.control.tabIndex >= 0 ? [e.view.control] : []
      )
    },
    refresh() {
      if (!destroyed) setActive()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stops.forEach((stop) => stop())
      listeners.forEach((stop) => stop())
      for (const e of entries) e.view?.destroy()
      appearances?.destroy()
      element.remove()
    },
  }
  return layer
}
