// Maps the style controls' names (`border`, `fill`, `width`…) to each annotation type's
// fields and back. Pure: no store, no DOM. A prop maps only where the type has the field, so a
// patch for a mixed selection lands on each annotation as far as it can.
import type { StyleGroup, StyleProps } from './tool-style'
import type { Annotation, AnnotationPatch, AnnotationType } from './types'

type StyleKey = keyof StyleProps

/** For each type, the control-level props it supports and the field each writes. */
const FIELDS: Readonly<
  Record<AnnotationType, Readonly<Partial<Record<StyleKey, string>>>>
> = {
  square: {
    border: 'color',
    fill: 'interiorColor',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
  },
  circle: {
    border: 'color',
    fill: 'interiorColor',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
  },
  polygon: {
    border: 'color',
    fill: 'interiorColor',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
  },
  polyline: {
    border: 'color',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
    head: 'head',
    tail: 'tail',
  },
  line: {
    border: 'color',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
    head: 'head',
    tail: 'tail',
  },
  // Ink is drawn solid, so it has no dashes.
  ink: { border: 'color', opacity: 'opacity', width: 'width' },
  highlight: { border: 'color', opacity: 'opacity' },
  underline: { border: 'color', opacity: 'opacity' },
  strikeout: { border: 'color', opacity: 'opacity' },
  squiggly: { border: 'color', opacity: 'opacity' },
  redact: { border: 'color', opacity: 'opacity' },
  // XFDF: a box's `color` is its fill; the text style lives in `defaultStyle`.
  freetext: {
    border: 'borderColor',
    fill: 'color',
    textColor: 'defaultStyle.color',
    opacity: 'opacity',
    width: 'width',
    dashes: 'dashes',
    fontFamily: 'defaultStyle.fontFamily',
    fontSize: 'defaultStyle.fontSize',
    fontWeight: 'defaultStyle.fontWeight',
    fontStyle: 'defaultStyle.fontStyle',
    textDecoration: 'defaultStyle.textDecoration',
    textAlign: 'defaultStyle.textAlign',
  },
  // The rim is the outline; the inside is the magnified page, so there is no fill, and the
  // rim is drawn solid.
  loupe: { border: 'color', opacity: 'opacity', width: 'width' },
  // A mask dims the page outside a shape: nothing for the style controls to change.
  mask: {},
  text: {},
  // An image, signatures among them: the style controls have nothing to change on it.
  stamp: {},
}

const GROUPS: Readonly<Record<AnnotationType, StyleGroup | undefined>> = {
  square: 'shape',
  circle: 'shape',
  line: 'shape',
  polyline: 'shape',
  polygon: 'shape',
  loupe: 'shape',
  ink: 'ink',
  freetext: 'text',
  highlight: 'markup',
  underline: 'markup',
  strikeout: 'markup',
  squiggly: 'markup',
  redact: 'redact',
  text: undefined,
  stamp: undefined,
  mask: undefined,
}

const SUPPORTED = new Map<AnnotationType, ReadonlySet<StyleKey>>(
  (Object.keys(FIELDS) as AnnotationType[]).map((type) => [
    type,
    new Set(Object.keys(FIELDS[type]) as StyleKey[]),
  ])
)

/** The style group an annotation's type belongs to; notes belong to none. */
export function styleGroupOf(a: Pick<Annotation, 'type'>): StyleGroup | undefined {
  return GROUPS[a.type]
}

/** The types in `group`, from the same table `styleGroupOf` reads. */
export function typesInGroup(group: StyleGroup): AnnotationType[] {
  return (Object.keys(GROUPS) as AnnotationType[]).filter((t) => GROUPS[t] === group)
}

/** The style group a type belongs to. */
export function styleGroupOfType(type: AnnotationType): StyleGroup | undefined {
  return GROUPS[type]
}

/**
 * The control-level props `type` supports. `intent` is reserved for types whose props depend
 * on it (a speech bubble's border and fill); no type uses it yet.
 */
export function supportedProps(
  type: AnnotationType,
  _intent?: string
): ReadonlySet<StyleKey> {
  return SUPPORTED.get(type) ?? new Set()
}

/**
 * The control values a field leaves out: `normal` weight and style, no decoration. The field
 * is absent rather than holding them, as XFDF writes only what differs.
 */
const UNSET: Readonly<Partial<Record<StyleKey, unknown>>> = {
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
}

/** The prefix of a field nested in `defaultStyle` (free text). */
const STYLE = 'defaultStyle.'

/**
 * The field patch `patch` means on `type`. Props the type lacks are dropped. A `null` fill
 * becomes `interiorColor: undefined` (`color` on free text), which removes the fill when the
 * store applies it; so does `normal` weight or style and no decoration. Free-text text props go
 * into a partial `defaultStyle`, which the store merges into the current one.
 */
export function toFields(type: AnnotationType, patch: StyleProps): AnnotationPatch {
  const fields = FIELDS[type]
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as StyleKey[]) {
    const field = fields[key]
    if (field === undefined) continue
    const raw = patch[key]
    const value = raw === null || raw === UNSET[key] ? undefined : raw
    if (field.startsWith(STYLE)) {
      const style = (out.defaultStyle ??= {}) as Record<string, unknown>
      style[field.slice(STYLE.length)] = value
    } else {
      out[field] = value
    }
  }
  return out
}

/** The control-level props an annotation shows, for the props its type supports. */
export function fromAnnotation(a: Annotation): StyleProps {
  const fields = FIELDS[a.type]
  const record = a as unknown as Record<string, unknown>
  const style = (record.defaultStyle ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(fields) as StyleKey[]) {
    const field = fields[key] as string
    const value = field.startsWith(STYLE)
      ? style[field.slice(STYLE.length)]
      : record[field]
    if (value !== undefined) out[key] = value
    else if (key === 'fill' || key === 'dashes') out[key] = null
    else if (key === 'head' || key === 'tail') out[key] = 'none'
    else if (UNSET[key] !== undefined) out[key] = UNSET[key]
  }
  return out
}
