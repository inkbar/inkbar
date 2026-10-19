// Maps the style controls' names (`border`, `fill`, `width`…) to each annotation type's
// fields and back. Pure: no store, no DOM. A prop maps only where the type has the field, so a
// patch for a mixed selection lands on each annotation as far as it can.
import type { StyleGroup, StyleProps } from './tool-style'
import type { Annotation, AnnotationType } from './types'

type StyleKey = keyof StyleProps

/** For each type, the control-level props it supports and the field each writes. */
const FIELDS: Readonly<
  Record<AnnotationType, Readonly<Partial<Record<StyleKey, string>>>>
> = {
  square: { border: 'color', fill: 'interiorColor', opacity: 'opacity', width: 'width' },
  circle: { border: 'color', fill: 'interiorColor', opacity: 'opacity', width: 'width' },
  polygon: { border: 'color', fill: 'interiorColor', opacity: 'opacity', width: 'width' },
  polyline: { border: 'color', opacity: 'opacity', width: 'width' },
  line: {
    border: 'color',
    opacity: 'opacity',
    width: 'width',
    head: 'head',
    tail: 'tail',
  },
  ink: { border: 'color', opacity: 'opacity', width: 'width' },
  highlight: { border: 'color', opacity: 'opacity' },
  underline: { border: 'color', opacity: 'opacity' },
  strikeout: { border: 'color', opacity: 'opacity' },
  squiggly: { border: 'color', opacity: 'opacity' },
  redact: { border: 'color', opacity: 'opacity' },
  // Free text gets its mapping with the free-text model (border box, fill, text style).
  freetext: {},
  text: {},
}

const GROUPS: Readonly<Record<AnnotationType, StyleGroup | undefined>> = {
  square: 'shape',
  circle: 'shape',
  line: 'shape',
  polyline: 'shape',
  polygon: 'shape',
  ink: 'ink',
  freetext: 'text',
  highlight: 'markup',
  underline: 'markup',
  strikeout: 'markup',
  squiggly: 'markup',
  redact: 'redact',
  text: undefined,
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
 * The field patch `patch` means on `type`. Props the type lacks are dropped. A `null` fill
 * becomes `interiorColor: undefined`, which removes the fill when the store applies it.
 */
export function toFields(type: AnnotationType, patch: StyleProps): Partial<Annotation> {
  const fields = FIELDS[type]
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as StyleKey[]) {
    const field = fields[key]
    if (field === undefined) continue
    const value = patch[key]
    out[field] = value === null ? undefined : value
  }
  return out
}

/** The control-level props an annotation shows, for the props its type supports. */
export function fromAnnotation(a: Annotation): StyleProps {
  const fields = FIELDS[a.type]
  const record = a as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(fields) as StyleKey[]) {
    const field = fields[key] as string
    const value = record[field]
    if (value !== undefined) out[key] = value
    else if (key === 'fill') out[key] = null
  }
  return out
}
