// The field objects the kept PDF.js scripting sandbox is started with, in PDF.js's own format
// (6.4.299: `getFieldObject` on each annotation class of `pdf.worker.mjs`), built from core's own
// shapes. The one place that format is written down.
//
// What PDF.js derives while building them, each reproduced here:
// - A text field's `datetimeFormat`: the first standard date or time script (AFDate_ or AFTime_,
//   Keystroke or Format, Ex or not, ending with `;`) among its Format then its Keystroke scripts,
//   with a number naming an entry of PDF.js's standard date or time list.
// - A text field's `hasDatetimeHTML`: whether PDF.js gives it its own date or time input, which
//   it does for one date or time Keystroke script beside one Format script. The reader gives those
//   two as one Format list, the Format first, and says so (`FileWidgetActions.keystrokeInFormat`).
//   The sandbox then parses and prints the field's value with `datetimeFormat`, and core's
//   scripting takes the formatted text of what it sends back.
// - A text field's `comb`: the Comb flag, without Multiline, Password or FileSelect, with a
//   maximum length.
// - A checkbox's or radio's `value` of `Off` when it has none, a checkbox widget's its own
//   (`FileWidget.value`, from its `/AS`); its `exportValues`, the widget's on value
//   (`FileWidget.onValue`), or `null` for a radio widget without one.
// - A choice field's `value`, its first selected value or `null`, and `numItems`, the number of
//   values selected (not of options: PDF.js's, and the sandbox never reads it).
// - `hidden`, from the Hidden or NoView flag (a text widget with `/PMD` has Hidden among the
//   reader's flags, as PDF.js hides it); `editable`, without ReadOnly.
// - `strokeColor` and `fillColor` as PDF.js keeps colours, three bytes in a typed array, which
//   reach the sandbox as an object of indices: what scripts reading them get with PDF.js too.
// - `defaultValue`: a text field's empty when it has none, every other kind's `null`.
import type { FileField, FileScripts, FileWidget } from '../reader/file'

/** `/Ff` bits. */
const FF_READ_ONLY = 1
const FF_MULTILINE = 1 << 12
const FF_PASSWORD = 1 << 13
const FF_FILE_SELECT = 1 << 20
const FF_MULTI_SELECT = 1 << 21
const FF_COMB = 1 << 24

/** Annotation `/F` bits PDF.js hides a widget for. */
const F_HIDDEN = 1 << 1
const F_NO_VIEW = 1 << 5

/** PDF.js's standard date and time formats, which a numbered format names. */
const DATE_FORMATS = [
  'm/d',
  'm/d/yy',
  'mm/dd/yy',
  'mm/yy',
  'd-mmm',
  'd-mmm-yy',
  'dd-mmm-yy',
  'yy-mm-dd',
  'mmm-yy',
  'mmmm-yy',
  'mmm d, yyyy',
  'mmmm d, yyyy',
  'm/d/yy h:MM tt',
  'm/d/yy HH:MM',
]
const TIME_FORMATS = ['HH:MM', 'h:MM tt', 'HH:MM:ss', 'h:MM:ss tt']

/** @internal A standard date or time script, as PDF.js matches one. */
export const DATE_TIME =
  /^AF(Date|Time)_(?:Keystroke|Format)(?:Ex)?\(['"]?([^'"]+)['"]?\);$/

/**
 * The field objects of `fields` as PDF.js gives the sandbox them, by field name in the order of
 * `scripts.fields`: for each entry, the field's own dictionary when it is not one of its widgets
 * (only its `id` and `type`: with a widget object beside it the sandbox reads nothing else of it),
 * then an object for each widget, in the order the field lists them. Entries that share a name
 * (two dictionaries of one full name) go into that name's list one after the other, as PDF.js
 * gives them. Each widget is found by its id among all of `fields`; one that `fields` does not
 * hold is left out, and with it an entry left with no widget. `null` when there are none, as
 * PDF.js gives.
 *
 * @internal
 */
export function sandboxFieldObjects(
  fields: readonly FileField[],
  scripts: FileScripts
): Map<string, unknown[]> | null {
  const byId = new Map<string, { field: FileField; widget: FileWidget }>()
  for (const field of fields)
    for (const widget of field.widgets)
      if (!byId.has(widget.id)) byId.set(widget.id, { field, widget })
  const out = new Map<string, unknown[]>()
  for (const entry of scripts.fields) {
    const objects: unknown[] = []
    for (const id of entry.widgets) {
      const found = byId.get(id)
      if (found) objects.push(widgetObject(found.field, found.widget))
    }
    if (objects.length === 0) continue
    if (entry.id !== undefined) objects.unshift({ id: entry.id, type: '' })
    const list = out.get(entry.name)
    if (list) list.push(...objects)
    else out.set(entry.name, objects)
  }
  return out.size > 0 ? out : null
}

function widgetObject(field: FileField, w: FileWidget): Record<string, unknown> {
  if (field.kind === 'signature')
    return { id: w.id, value: null, page: w.page, type: 'signature' }
  const scripts = w.actions.scripts
  const common = {
    id: w.id,
    editable: (field.flags & FF_READ_ONLY) === 0,
    name: field.name,
    rect: [...w.rect],
    hidden: (w.flags & (F_HIDDEN | F_NO_VIEW)) !== 0,
    // Built from entries, so an event named like `__proto__` stays the file's own.
    actions: scripts
      ? Object.fromEntries(
          Object.entries(scripts).map(([event, list]) => [event, [...list]])
        )
      : null,
    page: w.page,
    strokeColor: w.borderColor ? new Uint8ClampedArray(w.borderColor) : null,
    fillColor: w.backgroundColor ? new Uint8ClampedArray(w.backgroundColor) : null,
    rotation: w.rotation ?? 0,
  }
  const defaultValue = field.defaultValue ?? null
  switch (field.kind) {
    case 'text': {
      const flags = field.flags
      const maxLength = field.maxLength ?? 0
      const multiline = (flags & FF_MULTILINE) !== 0
      const password = (flags & FF_PASSWORD) !== 0
      return {
        ...common,
        value: typeof field.value === 'string' ? field.value : '',
        defaultValue: defaultValue || '',
        multiline,
        password,
        charLimit: maxLength,
        comb:
          (flags & FF_COMB) !== 0 &&
          !multiline &&
          !password &&
          (flags & FF_FILE_SELECT) === 0 &&
          maxLength !== 0,
        ...dateTime(scripts, w.actions.keystrokeInFormat === true),
        type: 'text',
      }
    }
    case 'checkbox':
    case 'radio':
    case 'button':
      return {
        ...common,
        value:
          (field.kind === 'checkbox' ? (w.value ?? field.value) : field.value) || 'Off',
        defaultValue,
        exportValues: field.kind === 'button' ? undefined : (w.onValue ?? null),
        type:
          field.kind === 'checkbox'
            ? 'checkbox'
            : field.kind === 'radio'
              ? 'radiobutton'
              : 'button',
      }
    case 'combo':
    case 'list': {
      const value = field.value
      const selected = Array.isArray(value) ? value : value === undefined ? [] : [value]
      return {
        ...common,
        value: selected.length > 0 ? selected[0] : null,
        defaultValue,
        numItems: selected.length,
        multipleSelection: (field.flags & FF_MULTI_SELECT) !== 0,
        items: (field.options ?? []).map((o) => ({ ...o })),
        type: field.kind === 'combo' ? 'combobox' : 'listbox',
      }
    }
  }
}

/**
 * A text field's date or time format and whether PDF.js gives it its own input, from its scripts
 * as the reader gives them and whether its Keystroke script is among its Format scripts.
 */
function dateTime(
  scripts: Record<string, string[]> | undefined,
  input: boolean
): {
  datetimeFormat: string | undefined
  hasDatetimeHTML: boolean
} {
  const format = scripts && Object.hasOwn(scripts, 'Format') ? scripts.Format : undefined
  const keystroke =
    scripts && Object.hasOwn(scripts, 'Keystroke') ? scripts.Keystroke : undefined
  for (const source of [...(format ?? []), ...(keystroke ?? [])]) {
    const m = DATE_TIME.exec(source)
    if (!m) continue
    const isDate = m[1] === 'Date'
    const written = m[2]!
    const num = parseInt(written, 10)
    const named =
      !isNaN(num) && Math.floor(Math.log10(num)) + 1 === written.length
        ? (isDate ? DATE_FORMATS : TIME_FORMATS)[num]
        : undefined
    return { datetimeFormat: named ?? written, hasDatetimeHTML: input }
  }
  return { datetimeFormat: undefined, hasDatetimeHTML: false }
}
