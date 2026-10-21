import type { ExportedAnnotation } from './types'
import type { Annotation as GlossAnnotation } from 'gloss-format'

/** Inkbar's own data in a Gloss file, under custom.inkbar. */
export interface InkbarCustom {
  type?: 'loupe' | 'mask'
  magnification?: number
  dim?: number
  pressure?: number[][]
  borderColor?: string
}

type Item = Record<string, unknown>

const isObject = (v: unknown): v is Item =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `rest` with `own` merged into a copy of its `custom.inkbar`; `own` wins. */
function withCustom(rest: Item, own: InkbarCustom): Item {
  const custom = isObject(rest.custom) ? rest.custom : {}
  const inkbar = isObject(custom.inkbar) ? custom.inkbar : {}
  return { ...rest, custom: { ...custom, inkbar: { ...inkbar, ...own } } }
}

/**
 * An annotation as a Gloss file writes it. Gloss has no loupe or mask and no pen pressure or
 * free-text border colour, so these go under `custom.inkbar`, with loupes and masks written as
 * the circle or square they draw.
 */
export function toFile(annotation: ExportedAnnotation): GlossAnnotation {
  switch (annotation.type) {
    case 'ink': {
      const { pressure, ...rest } = annotation
      return (pressure ? withCustom(rest, { pressure }) : rest) as GlossAnnotation
    }
    case 'freetext': {
      const { borderColor, ...rest } = annotation
      return (borderColor ? withCustom(rest, { borderColor }) : rest) as GlossAnnotation
    }
    case 'loupe': {
      const { magnification, ...rest } = annotation
      return withCustom(
        { ...rest, type: 'circle' },
        { type: 'loupe', magnification }
      ) as GlossAnnotation
    }
    case 'mask': {
      const { shape, dim, ...rest } = annotation
      return withCustom(
        { ...rest, type: shape === 'ellipse' ? 'circle' : 'square' },
        { type: 'mask', dim }
      ) as GlossAnnotation
    }
    default:
      return annotation
  }
}

/**
 * Moves `keys` from `custom.inkbar` to the top level of `raw`, replacing any top-level value
 * (an absent key deletes it), then drops `custom.inkbar`, and `custom`, if that leaves them
 * empty. Everything else under `custom` stays as it was.
 */
function lift(raw: Item, inkbar: Item, keys: readonly string[], extra: Item = {}): Item {
  const item: Item = { ...raw, ...extra }
  const left: Item = { ...inkbar }
  let consumed = false
  for (const key of keys) {
    delete item[key]
    if (key in left) {
      item[key] = left[key]
      delete left[key]
      consumed = true
    }
  }
  if (!consumed || !isObject(raw.custom)) return item
  const { inkbar: _inkbar, ...others } = raw.custom
  const custom = Object.keys(left).length > 0 ? { ...others, inkbar: left } : others
  if (Object.keys(custom).length > 0) item.custom = custom
  else delete item.custom
  return item
}

/** A file item read back by `fromFile`. */
export interface FromFile {
  /** The object for ExportedAnnotationSchema to parse. */
  item: Record<string, unknown>
  /**
   * Top-level keys of `item` that the file keeps under `custom.inkbar`, so an error in one is
   * reported at `custom.inkbar.<key>`.
   */
  lifted: readonly string[]
}

/**
 * A raw file item as Inkbar parses it: Inkbar's own data moves out of `custom.inkbar`. An item
 * it doesn't recognise passes through unchanged.
 */
export function fromFile(raw: Record<string, unknown>): FromFile {
  const inkbar =
    isObject(raw.custom) && isObject(raw.custom.inkbar) ? raw.custom.inkbar : {}
  const from = (keys: readonly string[], extra?: Item): FromFile => ({
    item: lift(raw, inkbar, keys, extra),
    lifted: keys,
  })
  const unchanged: FromFile = { item: raw, lifted: [] }
  switch (raw.type) {
    // A top-level `pressure` or `borderColor`, as older files wrote them, is dropped.
    case 'ink':
      return from(['pressure'])
    case 'freetext':
      return from(['borderColor'])
    case 'circle':
      if (inkbar.type === 'loupe') return from(['type', 'magnification'])
      if (inkbar.type === 'mask') return from(['type', 'dim'], { shape: 'ellipse' })
      return unchanged
    case 'square':
      if (inkbar.type === 'mask') return from(['type', 'dim'], { shape: 'rect' })
      return unchanged
    default:
      return unchanged
  }
}
