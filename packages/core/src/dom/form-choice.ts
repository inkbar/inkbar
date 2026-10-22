// Checkbox, radio, combo box and list box widgets.
//
// Checkboxes and radios are `<button role="checkbox|radio">`, clear over the PDF's own
// appearance. The form layer stores each one's on or off state for PDF.js, which draws the
// widget's own on or off appearance under it. Only a widget whose file has no on appearance
// draws itself, with its `/MK /CA` character in ZapfDingbats style. A click, or Space, commits
// the new state and then runs the widget's Mouse Up and Action; arrow keys move through a radio
// group's shown, editable widgets on the page and pick as they go.
//
// A combo box is a native `<select>` (an editable one is a text input with a `<datalist>`, in
// form-text.ts), and a list box a `<select>` with a `size`, or `multiple` for a multi-select.
// They show option labels and store export values, and every change commits. Like a text
// field, a choice control is clear over the PDF's appearance until it is focused or its value
// changes.
import { sameValue } from '../model/form/values'

import { BORDER_STYLES, createTextWidget, familyList } from './form-text'

import type {
  WidgetFrame,
  WidgetState,
  WidgetView,
  WidgetViewContext,
} from './form-layer'
import type { FieldValue } from '../model/form/types'

/** ZapfDingbats characters `/MK /CA` names, as the Unicode signs that look like them. */
const DINGBATS: Readonly<Record<string, string>> = {
  '3': '✓',
  '4': '✔',
  '7': '✗',
  '8': '✘',
  H: '★',
  l: '●',
  n: '■',
  u: '◆',
}

/** The share of the box's shorter side the check character fills, as PDF.js draws it. */
const GLYPH_RATIO = 0.8
/** Line height as a multiple of the font size, as PDF.js lays out field text. */
const LINE_FACTOR = 1.35
/** Auto size (`/DA` size 0) in a list box, in points. */
const LIST_AUTO = 12

/** Focus and Blur reach the widget's scripts. */
function sendFocus(ctx: WidgetViewContext, el: HTMLElement, onChange: () => void) {
  el.addEventListener('focus', () => {
    onChange()
    ctx.form._dispatch({ widget: ctx.widget.id, name: 'Focus' })
  })
  el.addEventListener('blur', () => {
    ctx.form._dispatch({ widget: ctx.widget.id, name: 'Blur' })
    onChange()
  })
}

/** A checkbox or radio widget. */
export function createToggleWidget(ctx: WidgetViewContext): WidgetView {
  const { form, field, widget } = ctx
  const ownerDoc = ctx.box.ownerDocument
  const radio = field.type === 'radio'
  const onState = widget.onState
  const appearance = widget.appearance
  const el = ownerDoc.createElement('button')
  el.type = 'button'
  el.className = 'ink-form-control'
  el.setAttribute('role', radio ? 'radio' : 'checkbox')
  el.setAttribute('aria-label', ctx.label)
  el.style.cssText =
    'position:absolute;box-sizing:border-box;margin:0;padding:0;border:none;' +
    'background:transparent;display:flex;align-items:center;justify-content:center;' +
    'line-height:1;overflow:hidden;transform-origin:center;' +
    `color:${appearance.color ?? '#000000'};`
  ctx.box.append(el)

  let state: WidgetState | undefined
  const on = () => onState !== undefined && state?.value === onState
  /** Only a widget without its own on appearance draws itself, and only while on. */
  const drawn = () => appearance.onAppearance === false && on()
  const glyph = () =>
    DINGBATS[appearance.checkStyle ?? ''] ?? (radio ? DINGBATS.l! : DINGBATS['4']!)

  const show = () => {
    el.setAttribute('aria-checked', on() ? 'true' : 'false')
    const text = drawn() ? glyph() : ''
    if (el.textContent !== text) el.textContent = text
  }

  const activate = () => {
    if (!state || state.readOnly || onState === undefined) return
    const next = radio ? onState : on() ? 'Off' : onState
    if (next !== state.value) {
      const result = form.set({ [field.name]: next })
      ctx.setInvalid(result.rejected.length > 0)
    }
    if (widget.hasScripts) form._dispatch({ widget: widget.id, name: 'Mouse Up' })
    form._dispatch({ widget: widget.id, name: 'Action' })
  }

  el.addEventListener('click', activate)
  el.addEventListener('keydown', (e) => {
    // Space toggles, as the button's own click; Enter does not, as for any checkbox.
    if (e.key === 'Enter') {
      e.preventDefault()
      return
    }
    if (!radio) return
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0
    if (step === 0) return
    e.preventDefault()
    // Hidden and read-only radios are passed over, and none is picked while this one is
    // read-only.
    if (state?.readOnly) return
    const group = ctx.siblings()
    const at = group.indexOf(el)
    if (at < 0 || group.length < 2) return
    const next = group[(at + step + group.length) % group.length]!
    next.focus()
    next.click()
  })
  sendFocus(ctx, el, () => undefined)

  return {
    control: el,
    activates: true,
    get drawn() {
      return drawn()
    },
    sync(next) {
      state = next
      show()
    },
    layout(frame: WidgetFrame) {
      el.style.fontSize = `${Math.min(frame.width, frame.height) * GLYPH_RATIO}px`
    },
    destroy() {
      el.remove()
    },
  }
}

/** A combo box (editable or not) or list box widget. */
export function createChoiceWidget(ctx: WidgetViewContext): WidgetView {
  const { field } = ctx
  if (field.type === 'combo' && field.flags.editable)
    return createTextWidget(ctx, field.options)
  return createSelectWidget(ctx)
}

function createSelectWidget(ctx: WidgetViewContext): WidgetView {
  const { form, field, widget } = ctx
  const ownerDoc = ctx.box.ownerDocument
  const list = field.type === 'list'
  const multi = list && field.flags.multiSelect
  const appearance = widget.appearance
  const el = ownerDoc.createElement('select')
  el.className = 'ink-form-control'
  el.setAttribute('aria-label', ctx.label)
  if (multi) el.multiple = true
  else if (list) el.size = Math.max(2, field.options.length)
  el.style.cssText =
    'position:absolute;box-sizing:border-box;margin:0;appearance:none;' +
    '-webkit-appearance:none;transform-origin:center;' +
    (list ? 'overflow-y:auto;' : 'overflow:hidden;')
  const options = field.options.map((o) => {
    const option = ownerDoc.createElement('option')
    option.value = o.value
    option.textContent = o.label
    el.append(option)
    return option
  })
  ctx.box.append(el)

  let state: WidgetState = {
    value: field.value,
    formatted: undefined,
    override: {},
    readOnly: false,
    required: false,
  }
  let frame: WidgetFrame | undefined
  let focused = false

  const chosen = (): string[] => {
    const v = state.value
    if (Array.isArray(v)) return [...(v as readonly string[])]
    return typeof v === 'string' ? [v] : []
  }
  const restyled = () => {
    const o = state.override
    return (
      o.textColor !== undefined ||
      o.fillColor !== undefined ||
      o.strokeColor !== undefined ||
      o.textSize !== undefined ||
      (o.hidden === false && (widget.hidden || widget.printOnly))
    )
  }
  const drawn = () => focused || !sameValue(state.value, field.value) || restyled()

  const show = () => {
    const picked = new Set(chosen())
    for (const option of options) option.selected = picked.has(option.value)
    if (!multi && !options.some((o) => o.selected)) el.selectedIndex = -1
  }

  const style = () => {
    if (!frame) return
    const s = el.style
    const o = state.override
    const shows = drawn()
    const bw = appearance.border ? appearance.border.width * frame.scale : 0
    const size = o.textSize ?? appearance.fontSize
    const px =
      size > 0
        ? size * frame.scale
        : list
          ? LIST_AUTO * frame.scale
          : Math.max(1, (frame.height - 2 * bw) / LINE_FACTOR)
    const color = o.textColor ?? appearance.color ?? '#000000'
    s.fontFamily = familyList(appearance.font?.family)
    s.fontWeight = appearance.font?.fontWeight ?? 'normal'
    s.fontStyle = appearance.font?.fontStyle ?? 'normal'
    s.fontSize = `${px}px`
    s.padding = `0 ${2 * frame.scale}px`
    s.color = shows ? color : 'transparent'
    s.backgroundColor = shows
      ? (o.fillColor ?? appearance.background ?? 'transparent')
      : 'transparent'
    const border = appearance.border
    const stroke = o.strokeColor ?? border?.color
    s.borderWidth = `${bw}px`
    if (shows && border && bw > 0 && stroke && stroke !== 'transparent') {
      s.borderStyle = BORDER_STYLES[border.style]
      s.borderColor = stroke
    } else {
      s.borderStyle = 'solid'
      s.borderColor = 'transparent'
    }
    // A list box's chosen options keep the browser's highlight only while it draws itself.
    for (const option of options) {
      option.style.color = shows ? '' : 'transparent'
      option.style.backgroundColor = shows ? '' : 'transparent'
    }
  }

  const commit = () => {
    // A select cannot be read-only: a change to a read-only field is put back.
    if (state.readOnly) {
      show()
      return
    }
    const value: FieldValue = multi
      ? options.filter((o) => o.selected).map((o) => o.value)
      : el.value
    if (sameValue(value, state.value)) return
    const result = form.set({ [field.name]: value })
    ctx.setInvalid(result.rejected.length > 0)
    // A refused change leaves the stored value, which nothing re-sends: show it again.
    show()
    style()
  }

  el.addEventListener('change', commit)
  sendFocus(ctx, el, () => {
    focused = ownerDoc.activeElement === el
    style()
    ctx.redraw()
  })

  return {
    control: el,
    get drawn() {
      return drawn()
    },
    sync(next) {
      state = next
      show()
      style()
    },
    layout(next) {
      frame = next
      style()
    },
    destroy() {
      el.remove()
    },
  }
}
