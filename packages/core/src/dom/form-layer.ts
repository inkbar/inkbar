// The page's form fields, as native controls over the canvas.
//
// Inline styles here are structural or geometric: the layer is `position:absolute; inset:0;
// pointer-events:none` over the page, each widget box is `position:absolute` at its rect from
// the transform, and its control is placed and turned inside the box (`/MK /R` and the page's
// turn). What a control looks like when it draws itself (font, size, colour, alignment, border,
// background) is the field's own appearance from the PDF or a script, as an annotation's colours
// are its own. The tint, focus ring and invalid mark are the theme's.
//
// Untouched widgets look exactly as the PDF draws them: the page canvas leaves fillable widgets
// out (`AnnotationMode.ENABLE_FORMS`), and the layer keeps a second canvas with every widget's
// own appearance (`ENABLE`), clipped to the widgets the layer is not drawing itself. That canvas
// sits in the page's stack right above the page canvas, under the text layer and the
// annotations, so annotations over a field stay visible; only the controls sit above the
// annotations, in the layer. A widget's
// control is clear until it is focused or shows something the PDF's appearance does not (a
// changed value, a script's colour or size); then the clip leaves it out and the control draws.
import { sameValue } from '../model/form/values'

import { createTextWidget } from './form-text'
import { createPageRenderer, type PageRenderer } from './page-renderer'
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
  /** Device pixel ratio for the appearance canvas; `window.devicePixelRatio` when omitted. */
  devicePixelRatio?: number
  /** The appearance canvas failed to render (cancellations are not reported). */
  onError?(error: unknown): void
  /** The appearance canvas painted. */
  onRendered?(): void
}

export interface FormLayer {
  readonly element: HTMLElement
  /** Places every widget for a new zoom or rotation, in place: focus, caret and typed text stay. */
  update(t: PageTransform): void
  /** Focuses the widget's control. False when the widget is not on this page or is hidden. */
  focusWidget(id: string): boolean
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
  sync(state: WidgetState): void
  /** The control was placed in a new frame (zoom or rotation). */
  layout(frame: WidgetFrame): void
  destroy(): void
}

export type WidgetRenderer = (ctx: WidgetViewContext) => WidgetView

/** The field types the layer draws controls for. Widgets of other types keep their appearance. */
const RENDERERS: Partial<Record<FormFieldType, WidgetRenderer>> = {
  text: createTextWidget,
}

/** CSS px the appearance clip reaches past a widget's rect, to keep its anti-aliased edge. */
const CLIP_PAD = 1

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

  const entries: Entry[] = []
  for (const field of form.fields.get())
    for (const widget of field.widgets) {
      if (widget.page !== page) continue
      const box = ownerDoc.createElement('div')
      box.className = 'ink-form-widget'
      box.dataset.inkWidget = widget.id
      box.dataset.inkField = field.name
      box.dataset.inkType = field.type
      box.style.cssText = 'position:absolute;pointer-events:none;'
      element.append(box)
      entries.push({
        field,
        widget,
        box,
        view: undefined,
        value: form.values.get()[field.name],
      })
    }

  // The PDF's own widget appearances: right above the page canvas, under the text layer and
  // the annotations.
  let appearance: PageRenderer | undefined
  if (entries.length > 0) {
    appearance = createPageRenderer({
      document: doc,
      page,
      host,
      transform,
      drawWidgets: true,
      ...(opts.devicePixelRatio === undefined
        ? {}
        : { devicePixelRatio: opts.devicePixelRatio }),
      ...(opts.onError ? { onError: (error: unknown) => opts.onError?.(error) } : {}),
      ...(opts.onRendered ? { onRendered: () => opts.onRendered?.() } : {}),
    })
    const wrapper = appearance.element
    wrapper.className = 'ink-form-appearance'
    delete wrapper.dataset.inkCanvasLayer
    wrapper.dataset.inkFormAppearance = ''
    wrapper.style.pointerEvents = 'none'
    const canvasLayer = host.querySelector(':scope > [data-ink-canvas-layer]')
    if (canvasLayer) canvasLayer.after(wrapper)
    else host.prepend(wrapper)
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

  /** Clips the appearance canvas to the widgets that show the PDF's own appearance. */
  const clip = () => {
    const wrapper = appearance?.element
    if (!wrapper) return
    const parts: string[] = []
    for (const e of entries) {
      if (e.view?.drawn || hiddenOf(e)) continue
      const r = transform.toCssRect(e.widget.rect)
      const x = r.left - CLIP_PAD
      const y = r.top - CLIP_PAD
      const w = r.width + 2 * CLIP_PAD
      const h = r.height + 2 * CLIP_PAD
      parts.push(`M${x} ${y}h${w}v${h}h${-w}Z`)
    }
    wrapper.style.visibility = parts.length > 0 ? '' : 'hidden'
    wrapper.style.clipPath = parts.length > 0 ? `path('${parts.join('')}')` : ''
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

  const syncAll = () => {
    if (destroyed) return
    for (const e of entries) syncEntry(e)
    clip()
  }

  const setActive = () => {
    const active = opts.isActive()
    for (const e of entries) {
      if (!e.view) continue
      e.box.style.pointerEvents = active ? 'auto' : 'none'
      e.view.control.tabIndex = active ? 0 : -1
    }
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
          clip()
        },
        setInvalid: (invalid) => setInvalid(e, invalid),
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
        listen(box, 'pointerup', mouse('Mouse Up'))
      }
    }
    place(e)
  }
  syncAll()
  setActive()

  const stops = [
    form.values.subscribe(syncAll),
    form.formatted.subscribe(syncAll),
    form.widgetState.subscribe(syncAll),
    form.on('focus', (id) => {
      layer.focusWidget(id)
    }),
  ]
  void form._pageEvent(page, 'PageOpen')

  const layer: FormLayer = {
    element,
    update(next) {
      if (destroyed) return
      transform = next
      appearance?.update(next)
      for (const e of entries) place(e)
      clip()
    },
    focusWidget(id) {
      const e = entries.find((x) => x.widget.id === id)
      if (destroyed || !e?.view || hiddenOf(e)) return false
      e.view.control.focus()
      return ownerDoc.activeElement === e.view.control
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
      appearance?.destroy()
      element.remove()
      void form._pageEvent(page, 'PageClose')
    },
  }
  return layer
}
