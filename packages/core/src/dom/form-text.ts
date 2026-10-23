// A text field's widget: a native `<input>` (single-line, password, comb) or `<textarea>`
// (multiline), so keyboard, IME and screen readers work as anywhere else on the page.
//
// Every keystroke goes through `form._keystroke`, so keystroke scripts can refuse or change it;
// the value commits through `form.set` on blur and on Enter in a single-line field. While the
// control is focused it shows the raw value; otherwise the formatted one. The text it draws
// takes the field's `/DA` font, size and colour, `/Q` alignment and `/MK` border and
// background, or a script's colours and size over them.
//
// An editable combo box is the same control with a `<datalist>` of its options: a person picks
// one or types their own text. It shows each option's label and stores its export value.
import { fontFamilyValue } from './signature-pad'

import type {
  WidgetFrame,
  WidgetState,
  WidgetView,
  WidgetViewContext,
} from './form-layer'
import type { FieldOption } from '../model/form/types'

/** Line height as a multiple of the font size, as PDF.js lays out field text. */
const LINE_FACTOR = 1.35
/** Points between the border and the text, as Acrobat leaves. */
const PADDING = 2
/** Auto size (`/DA` size 0) in a multiline field starts here, in points, and shrinks to fit. */
const MULTILINE_AUTO = 12
/** The smallest auto size, in points. */
const AUTO_MIN = 4

/** A font family from `/DA` as a CSS font-family list, closest standard fallbacks after it. */
export function familyList(family: string | undefined): string {
  if (!family) return 'Helvetica, Arial, sans-serif'
  if (/^times/i.test(family))
    return `${fontFamilyValue(family)}, 'Times New Roman', serif`
  if (/^courier/i.test(family))
    return `${fontFamilyValue(family)}, 'Courier New', monospace`
  return `${fontFamilyValue(family)}, Helvetica, Arial, sans-serif`
}

export const BORDER_STYLES = {
  solid: 'solid',
  dashed: 'dashed',
  beveled: 'outset',
  inset: 'inset',
  underline: 'solid',
} as const

type Control = HTMLInputElement | HTMLTextAreaElement

interface Snapshot {
  value: string
  start: number
  end: number
}

/** The edit that turned `before` into `after`: what replaced which range of `before`. */
function editOf(
  before: Snapshot,
  after: string
): { start: number; end: number; change: string } {
  const { value, start, end } = before
  const tail = value.length - end
  // The selection explains it: its text was replaced (typing, pasting, deleting a selection).
  if (
    after.length >= start + tail &&
    after.startsWith(value.slice(0, start)) &&
    after.endsWith(value.slice(end))
  )
    return { start, end, change: after.slice(start, after.length - tail) }
  // Otherwise (a backspace beside a collapsed caret, a word deleted): the differing middle.
  let p = 0
  while (p < value.length && p < after.length && value[p] === after[p]) p++
  let s = 0
  while (
    s < value.length - p &&
    s < after.length - p &&
    value[value.length - 1 - s] === after[after.length - 1 - s]
  )
    s++
  return { start: p, end: value.length - s, change: after.slice(p, after.length - s) }
}

let lists = 0

/**
 * A text field's control, or with `choices` an editable combo box's: the options are offered
 * by label, and a label typed or picked is stored as its export value.
 */
export function createTextWidget(
  ctx: WidgetViewContext,
  choices?: readonly FieldOption[]
): WidgetView {
  const { form, field, widget } = ctx
  const ownerDoc = ctx.box.ownerDocument
  const multiline = !choices && field.flags.multiline
  const el: Control = ownerDoc.createElement(multiline ? 'textarea' : 'input')
  if (el instanceof HTMLInputElement) el.type = field.flags.password ? 'password' : 'text'
  el.className = 'ink-form-control'
  el.autocomplete = 'off'
  el.spellcheck = !field.flags.doNotSpellCheck
  if (field.maxLength !== undefined && field.maxLength > 0) el.maxLength = field.maxLength
  el.setAttribute('aria-label', ctx.label)
  el.style.cssText =
    'position:absolute;box-sizing:border-box;margin:0;resize:none;overflow:hidden;' +
    'transform-origin:center;white-space:pre-wrap;'
  if (!multiline) el.style.whiteSpace = 'pre'
  const comb =
    field.flags.comb &&
    !multiline &&
    !field.flags.password &&
    field.maxLength !== undefined &&
    field.maxLength > 0
      ? field.maxLength
      : 0
  if (comb) ctx.box.dataset.inkComb = String(comb)
  ctx.box.append(el)
  let datalist: HTMLDataListElement | undefined
  if (choices) {
    datalist = ownerDoc.createElement('datalist')
    datalist.id = `ink-form-list-${++lists}`
    for (const o of choices) {
      const option = ownerDoc.createElement('option')
      option.value = o.label
      datalist.append(option)
    }
    ctx.box.append(datalist)
    el.setAttribute('list', datalist.id)
  }
  /** The text shown for a stored value: an option's label, else the value itself. */
  const label = (value: string) => choices?.find((o) => o.value === value)?.label ?? value
  /** The value stored for text: the export value of the option it labels, else the text. */
  const valueOf = (text: string) => choices?.find((o) => o.label === text)?.value ?? text

  const appearance = widget.appearance
  const initial = typeof field.value === 'string' ? field.value : ''
  let state: WidgetState = {
    value: field.value,
    formatted: undefined,
    override: {},
    readOnly: false,
    required: false,
  }
  let frame: WidgetFrame | undefined
  let focused = false
  /** Text was typed since focus or the last commit. */
  let typed = false
  let composing = false
  let before: Snapshot = { value: '', start: 0, end: 0 }

  const raw = (): string => (typeof state.value === 'string' ? state.value : '')
  const changed = () => raw() !== initial
  /** Script state the PDF's appearance does not show. */
  const restyled = () => {
    const o = state.override
    return (
      o.textColor !== undefined ||
      o.fillColor !== undefined ||
      o.strokeColor !== undefined ||
      o.textSize !== undefined ||
      // A widget the PDF hides has no appearance to show.
      (o.hidden === false && (widget.hidden || widget.printOnly))
    )
  }
  const drawn = () => focused || changed() || restyled()

  const snap = (): Snapshot => ({
    value: el.value,
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  })

  let measurer: CanvasRenderingContext2D | null | undefined
  const fontAt = (px: number) =>
    `${appearance.font?.fontStyle ?? 'normal'} ${appearance.font?.fontWeight ?? 'normal'} ${px}px ${familyList(appearance.font?.family)}`
  const textWidth = (text: string, px: number): number => {
    measurer ??= ownerDoc.createElement('canvas').getContext('2d')
    if (!measurer) return 0
    measurer.font = fontAt(px)
    return measurer.measureText(text).width
  }

  /** The border width in CSS px. */
  const borderPx = () =>
    appearance.border && frame ? appearance.border.width * frame.scale : 0

  /** The font size in CSS px: the script's or `/DA`'s, or fitted to the box for auto size. */
  const fontPx = (): number => {
    if (!frame) return 0
    const size = state.override.textSize ?? appearance.fontSize
    if (size > 0) return size * frame.scale
    const inner = frame.width - 2 * (borderPx() + PADDING * frame.scale)
    const min = AUTO_MIN * frame.scale
    if (multiline) return Math.max(min, MULTILINE_AUTO * frame.scale)
    const start = Math.max(min, (frame.height - 2 * borderPx()) / LINE_FACTOR)
    const shown = field.flags.password ? '•'.repeat(el.value.length) : el.value
    const width = textWidth(shown, start)
    return width > inner && width > 0 ? Math.max(min, (start * inner) / width) : start
  }

  /** A multiline auto-size field shrinks until its text fits the box. */
  const fitLines = () => {
    if (!frame || !multiline) return
    if ((state.override.textSize ?? appearance.fontSize) > 0) return
    let px = fontPx()
    const min = AUTO_MIN * frame.scale
    el.style.fontSize = `${px}px`
    while (px > min && el.scrollHeight > el.clientHeight + 1) {
      px = Math.max(min, px * 0.9)
      el.style.fontSize = `${px}px`
    }
  }

  const style = () => {
    if (!frame) return
    const s = el.style
    const o = state.override
    const px = fontPx()
    const color = o.textColor ?? appearance.color ?? '#000000'
    s.fontFamily = familyList(appearance.font?.family)
    s.fontWeight = appearance.font?.fontWeight ?? 'normal'
    s.fontStyle = appearance.font?.fontStyle ?? 'normal'
    s.fontSize = `${px}px`
    s.lineHeight = multiline ? `${LINE_FACTOR}` : 'normal'
    s.color = color
    s.caretColor = color === 'transparent' ? '#000000' : color
    s.textAlign = comb ? 'left' : appearance.align
    const bw = borderPx()
    const pad = PADDING * frame.scale
    const shows = drawn()
    // Clear while the PDF's own appearance shows underneath.
    s.setProperty('-webkit-text-fill-color', shows ? color : 'transparent')
    const border = appearance.border
    const stroke = o.strokeColor ?? border?.color
    if (shows && border && bw > 0 && stroke && stroke !== 'transparent') {
      s.borderStyle = 'none'
      s.borderWidth = `${bw}px`
      s.borderColor = stroke
      if (border.style === 'underline') s.borderBottomStyle = 'solid'
      else s.borderStyle = BORDER_STYLES[border.style]
    } else {
      s.borderStyle = 'solid'
      s.borderWidth = `${bw}px`
      s.borderColor = 'transparent'
    }
    s.backgroundColor = shows
      ? (o.fillColor ?? appearance.background ?? 'transparent')
      : 'transparent'
    if (comb) {
      const cell = (frame.width - 2 * bw) / comb
      const glyph = textWidth('0', px)
      s.letterSpacing = `${Math.max(0, cell - glyph)}px`
      s.paddingLeft = `${Math.max(0, (cell - glyph) / 2)}px`
      s.paddingRight = '0px'
      s.backgroundImage =
        shows && border && bw > 0 && stroke && stroke !== 'transparent'
          ? `repeating-linear-gradient(to right, transparent 0 ${cell - bw}px, ${stroke} ${cell - bw}px ${cell}px)`
          : ''
    } else {
      s.letterSpacing = ''
      s.paddingLeft = `${pad}px`
      s.paddingRight = `${pad}px`
    }
    s.paddingTop = multiline ? `${pad / 2}px` : '0px'
    s.paddingBottom = multiline ? `${pad / 2}px` : '0px'
    fitLines()
  }

  /** Shows the raw value while focused and the formatted one otherwise. */
  const show = () => {
    const text = focused ? label(raw()) : (state.formatted ?? label(raw()))
    if (el.value !== text) el.value = text
  }

  const commit = () => {
    if (!typed) return
    typed = false
    const text = valueOf(el.value)
    if (text === raw()) {
      show()
      return
    }
    const result = form.set({ [field.name]: text })
    const refused = result.rejected.length > 0
    ctx.setInvalid(refused)
    if (refused && focused) {
      // The form keeps the refused text as typed, so the field shows it to be corrected.
      typed = true
      style()
      return
    }
    // A rejected commit on blur leaves the stored value, which nothing re-sends: show it again.
    show()
    style()
  }

  const keystroke = () => {
    const prev = before
    const next = el.value
    if (next === prev.value) return
    const { start, end, change } = editOf(prev, next)
    const result = form._keystroke(widget.id, change, start, end)
    if (!result.accepted) {
      el.value = prev.value
      el.setSelectionRange(prev.start, prev.end)
      return
    }
    typed = true
    if (result.value !== el.value) {
      el.value = result.value
      el.setSelectionRange(result.selStart, result.selEnd)
    }
    before = snap()
    style()
  }

  const on = <K extends keyof HTMLElementEventMap>(
    type: K,
    fn: (ev: HTMLElementEventMap[K]) => void
  ) => el.addEventListener(type, fn as EventListener)

  on('focus', () => {
    focused = true
    typed = false
    show()
    before = snap()
    style()
    ctx.redraw()
    form._dispatch({ widget: widget.id, name: 'Focus' })
  })
  on('blur', () => {
    commit()
    focused = false
    composing = false
    form._dispatch({ widget: widget.id, name: 'Blur' })
    show()
    style()
    ctx.redraw()
  })
  on('beforeinput', () => {
    if (!composing) before = snap()
  })
  on('compositionstart', () => {
    composing = true
  })
  on('compositionend', () => {
    composing = false
    keystroke()
  })
  on('input', (e) => {
    if (composing || e.isComposing) return
    keystroke()
  })
  on('keydown', (e) => {
    if (e.key !== 'Enter' || multiline || e.isComposing) return
    e.preventDefault()
    commit()
    before = snap()
  })

  return {
    control: el,
    get drawn() {
      return drawn()
    },
    sync(next) {
      const was = raw()
      state = next
      el.readOnly = next.readOnly
      if (!focused) show()
      else if (raw() !== was) {
        // A new stored value while focused (a commit, a script) replaces the text, as the form
        // dropped what was typed before it.
        typed = false
        show()
        before = snap()
      }
      style()
    },
    layout(next) {
      frame = next
      style()
    },
    destroy() {
      el.remove()
      datalist?.remove()
    },
  }
}
