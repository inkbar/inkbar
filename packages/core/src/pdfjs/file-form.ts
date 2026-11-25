// The form's fields as PDF.js reports them through each page's widgets, in core's own shape.
import type { PdfjsAnnotationData } from './types'
import type {
  FileField,
  FileFieldKind,
  FileWidget,
  FileWidgetActions,
} from '../reader/file'

type Rgb = [number, number, number]

// Annotation `/F` bits.
const F_HIDDEN = 1 << 1
const F_NO_VIEW = 1 << 5

/** The first three components, or undefined when there are fewer. */
function rgb(c: ArrayLike<number> | null | undefined): Rgb | undefined {
  return c && c.length >= 3 ? [c[0]!, c[1]!, c[2]!] : undefined
}

function kindOf(d: PdfjsAnnotationData): FileFieldKind | undefined {
  switch (d.fieldType) {
    case 'Tx':
      return 'text'
    case 'Ch':
      return d.combo ? 'combo' : 'list'
    case 'Sig':
      return 'signature'
    case 'Btn':
      if (d.pushButton) return 'button'
      if (d.radioButton) return 'radio'
      return d.checkBox ? 'checkbox' : undefined
    default:
      return undefined
  }
}

/**
 * `/F`. PDF.js hides a text widget with `/PMD` (a barcode) without setting Hidden in the flags it
 * reports, so Hidden is added for a widget it hides that neither Hidden nor NoView explains.
 */
function flagsOf(d: PdfjsAnnotationData): number {
  const flags = d.annotationFlags ?? 0
  return d.hidden === true && (flags & (F_HIDDEN | F_NO_VIEW)) === 0
    ? flags | F_HIDDEN
    : flags
}

function actionsOf(d: PdfjsAnnotationData): FileWidgetActions {
  const { actions } = d
  const scripts = !actions
    ? undefined
    : actions instanceof Map
      ? Object.fromEntries(actions)
      : { ...actions }
  return {
    ...(scripts ? { scripts } : {}),
    ...(typeof d.url === 'string' ? { url: d.url } : {}),
    ...(d.newWindow !== undefined ? { newWindow: d.newWindow } : {}),
    ...(typeof d.action === 'string' ? { named: d.action } : {}),
    ...(d.resetForm ? { resetForm: d.resetForm } : {}),
  }
}

function widgetOf(page: number, at: number, d: PdfjsAnnotationData): FileWidget {
  const [x1, y1, x2, y2] = d.rect
  // PDF.js gives a radio's on value as `buttonValue` and a checkbox's as `exportValue`.
  const onValue = d.radioButton ? d.buttonValue : d.exportValue
  const borderColor = rgb(d.borderColor)
  const backgroundColor = rgb(d.backgroundColor)
  const da = d.defaultAppearanceData
  const daColor = rgb(da?.fontColor as ArrayLike<number> | undefined)
  return {
    id: d.id,
    page,
    at,
    rect: [x1, y1, x2, y2],
    flags: flagsOf(d),
    hasAppearance: d.hasAppearance === true,
    ...(typeof onValue === 'string' ? { onValue } : {}),
    ...(d.borderStyle
      ? {
          border: {
            width: d.borderStyle.width,
            ...(d.borderStyle.style !== undefined ? { style: d.borderStyle.style } : {}),
          },
        }
      : {}),
    ...(borderColor ? { borderColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(typeof d.rotation === 'number' ? { rotation: d.rotation } : {}),
    ...(typeof d.textAlignment === 'number' ? { alignment: d.textAlignment } : {}),
    ...(typeof d.alternativeText === 'string' ? { tooltip: d.alternativeText } : {}),
    ...(da
      ? {
          defaultAppearance: {
            fontSize: da.fontSize,
            ...(da.fontName !== undefined ? { fontName: da.fontName } : {}),
            ...(daColor ? { color: daColor } : {}),
          },
        }
      : {}),
    actions: actionsOf(d),
  }
}

/** `w` with any reset reference to a left-out widget given as that widget's field name. */
function withLeftOut(w: FileWidget, leftOut: ReadonlyMap<string, string>): FileWidget {
  const reset = w.actions.resetForm
  if (!reset?.refs.some((r) => leftOut.has(r))) return w
  const resetForm = {
    fields: [...reset.fields, ...reset.refs.flatMap((r) => leftOut.get(r) ?? [])],
    refs: reset.refs.filter((r) => !leftOut.has(r)),
    include: reset.include,
  }
  return { ...w, actions: { ...w.actions, resetForm } }
}

const valueOf = (v: PdfjsAnnotationData['fieldValue']): string | string[] | undefined =>
  v === null || v === undefined ? undefined : v

/**
 * @internal Terminal fields from the widgets PDF.js lists, each with its page and place among the
 * page's listed annotations. Widgets are grouped by full name, in the order given, and fields go
 * in the order of their first widgets. A field's kind, flags, values, options and maximum length
 * are its first widget's, as PDF.js reports them on every widget. A widget with no field name, or
 * whose first widget's field type PDF.js cannot name, is left out with its field; a ResetForm
 * reference to such a widget becomes its field's name.
 */
export function fileFieldsFromPdfjs(
  widgets: readonly { page: number; at: number; data: PdfjsAnnotationData }[]
): FileField[] {
  const groups = new Map<
    string,
    { page: number; at: number; data: PdfjsAnnotationData }[]
  >()
  for (const w of widgets) {
    const name = w.data.fieldName
    if (w.data.subtype !== 'Widget' || !name) continue
    let group = groups.get(name)
    if (!group) groups.set(name, (group = []))
    group.push(w)
  }
  const kinds = new Map(
    [...groups].map(([name, group]) => [name, kindOf(group[0]!.data)])
  )
  // A reset that names a left-out widget by reference names its field instead, so it still names
  // something and does not turn into a reset of every field.
  const leftOut = new Map<string, string>()
  for (const [name, group] of groups)
    if (!kinds.get(name)) for (const w of group) leftOut.set(w.data.id, name)
  const fields: FileField[] = []
  for (const [name, group] of groups) {
    // The field-level facts are the first widget's.
    const d = group[0]!.data
    const kind = kinds.get(name)
    if (!kind) continue
    const value = valueOf(d.fieldValue)
    const defaultValue = valueOf(d.defaultFieldValue)
    fields.push({
      name,
      kind,
      flags: d.fieldFlags ?? 0,
      ...(value !== undefined ? { value } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(d.options ? { options: d.options } : {}),
      ...(typeof d.maxLen === 'number' ? { maxLength: d.maxLen } : {}),
      widgets: group.map((w) => withLeftOut(widgetOf(w.page, w.at, w.data), leftOut)),
    })
  }
  return fields
}
