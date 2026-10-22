import {
  Circle,
  Color,
  commonFields,
  FreeText,
  FreeTextStyle as GlossFreeTextStyle,
  GLOSS_FORMAT,
  GLOSS_VERSION,
  Highlight,
  Ink,
  Line,
  LineEnding as GlossLineEnding,
  Note,
  NoteIcon,
  Point,
  Polygon,
  Polyline,
  Rect,
  Redact,
  Square,
  Stamp,
  type Annotation as GlossAnnotation,
  type GlossDocument,
  type UnknownAnnotation,
} from 'gloss-format'
import { z } from 'zod'

import { FringeSchema } from './callout'

import type { FieldValue } from '../form/types'

export {
  GLOSS_FORMAT,
  GLOSS_MEDIA_TYPE,
  GLOSS_SCHEMA_ID,
  GLOSS_VERSION,
} from 'gloss-format'

// Each schema starts from its Gloss definition and rebuilds it as a plain object, so unknown keys
// are dropped on import, nested ones included. Inkbar then requires what it always fills in.

export const PointSchema = z.object(Point.shape)
export const RectSchema = z.object(Rect.shape)
export const QuadSchema = z.object({
  p1: PointSchema,
  p2: PointSchema,
  p3: PointSchema,
  p4: PointSchema,
})

/** What Inkbar adds to every Gloss type: the fields it always fills in, and its viewer state. */
const Base = {
  /** Bounding box in PDF user space. */
  rect: RectSchema,
  /** Resolved #RRGGBB. Written into the PDF later, so it is always concrete. */
  color: Color,
  opacity: commonFields.opacity.removeDefault(),
  createdAt: commonFields.createdAt.unwrap(),
  modifiedAt: commonFields.modifiedAt.unwrap(),
  /** Created in this session, or imported from the file. Viewer state, never exported. */
  source: z.enum(['session', 'pdf']),
  /** Embedded annotations are locked until the engine can rewrite the file. Viewer state, never exported. */
  locked: z.boolean().optional(),
}

const Quads = z.array(QuadSchema).min(1)

export const TextMarkupSchema = z.object({
  ...Highlight.shape,
  ...Base,
  type: z.enum(['highlight', 'underline', 'strikeout', 'squiggly']),
  quads: Quads,
})

/** A note's icon (XFDF `icon`): a PDF name, so a name Inkbar does not know is kept. */
export const NoteIconSchema = NoteIcon

export const NoteSchema = z.object({ ...Note.shape, ...Base })

/** A line ending (XFDF `head`/`tail`): a PDF name, so a name Inkbar does not know is kept. */
export const LineEndingSchema = GlossLineEnding

/**
 * A key a type refuses outright rather than dropping like other unknown keys: one an older
 * shape used (so its value is not silently lost), or one that means nothing on the type (so a
 * later version is free to give it a meaning).
 */
const Refused = z.never().optional()

/**
 * A free-text box's text style, keyed by the CSS property names XFDF writes in its
 * `defaultstyle` string. The older `align` is refused; other unknown keys are dropped.
 */
export const FreeTextStyleSchema = z.object({
  ...GlossFreeTextStyle.shape,
  /** The text colour. */
  color: Color,
  align: Refused,
})

/**
 * Free text, as XFDF has it: `color` is the box's fill and the text style lives in
 * `defaultStyle`. A box in the older shape (top-level `fontFamily`, `fontSize`, `align`) is
 * refused rather than silently losing its style; other unknown keys are dropped.
 */
export const FreeTextSchema = z.object({
  ...FreeText.shape,
  ...Base,
  /** The box's fill (XFDF `color`). Absent means no fill. */
  color: FreeText.shape.color,
  /** The box's border colour. Absent means the text colour. */
  borderColor: Color.optional(),
  defaultStyle: FreeTextStyleSchema,
  fringe: FringeSchema.optional(),
  callout: z.array(PointSchema).min(2).max(3).optional(),
  fontFamily: Refused,
  fontSize: Refused,
  align: Refused,
})

export const SquareSchema = z.object({ ...Square.shape, ...Base })

export const CircleSchema = z.object({ ...Circle.shape, ...Base, cornerRadius: Refused })

export const ShapeSchema = z.discriminatedUnion('type', [SquareSchema, CircleSchema])

export const LineSchema = z.object({
  ...Line.shape,
  ...Base,
  start: PointSchema,
  end: PointSchema,
})

const Vertices = z.array(PointSchema).min(2)

export const PolylineSchema = z.object({ ...Polyline.shape, ...Base, vertices: Vertices })

export const PolygonSchema = z.object({
  ...Polygon.shape,
  ...Base,
  vertices: Vertices,
  head: Refused,
  tail: Refused,
})

export const PolySchema = z.discriminatedUnion('type', [PolylineSchema, PolygonSchema])

const InkShape = z.object({
  ...Ink.shape,
  ...Base,
  inklist: z.array(z.array(PointSchema).min(1)).min(1),
  /** Pen pressure from 0 to 1, one value per point of each stroke. Absent means even pressure. */
  pressure: z.array(z.array(z.number().min(0).max(1))).optional(),
})

/** Pressure must have one value per point of each stroke. */
function checkPressure(
  a: { inklist: unknown[][]; pressure?: unknown[][] | undefined },
  ctx: z.core.$RefinementCtx
): void {
  if (!a.pressure) return
  const ok =
    a.pressure.length === a.inklist.length &&
    a.pressure.every((p, i) => p.length === a.inklist[i]?.length)
  if (!ok)
    ctx.addIssue({
      code: 'custom',
      path: ['pressure'],
      message: 'pressure must have the same shape as inklist',
    })
}

export const InkSchema = InkShape.superRefine(checkPressure)

/** A PNG or JPEG image as a base64 `data:` URL, as XFDF carries a stamp's `<imagedata>`. */
export { IMAGE_DATA_URL } from 'gloss-format'

/**
 * An image on the page (XFDF `stamp`), drawn to fill `rect`. Image and typed signatures are
 * stamps with `subject: 'Signature'`.
 */
export const StampSchema = z.object({ ...Stamp.shape, ...Base })

/**
 * A loupe (Inkbar's own type, a circle with `custom.inkbar.type: 'loupe'` in a file): a circle
 * inscribed in `rect` that shows the page content under its own centre, magnified. `color` and
 * `width` draw its rim.
 */
export const LoupeSchema = z.object({
  type: z.literal('loupe'),
  ...commonFields,
  /** How many times larger the content under the centre is drawn. Above 1. */
  magnification: z.number().gt(1).default(2),
  /** The rim's width in points. */
  width: z.number().nonnegative().default(2),
  ...Base,
})

/**
 * A mask (Inkbar's own type, a circle or square with `custom.inkbar.type: 'mask'` in a file):
 * dims everything on the page outside `shape` drawn in `rect`, an ellipse inscribed in it or the
 * rectangle itself. `color` is the dimming colour and `dim` how strongly it covers, from 0 to 1.
 * One per page: adding a second replaces the first.
 */
export const MaskSchema = z.object({
  type: z.literal('mask'),
  ...commonFields,
  shape: z.enum(['rect', 'ellipse']),
  dim: z.number().min(0).max(1).default(0.5),
  ...Base,
})

export const RedactSchema = z.object({
  ...Redact.shape,
  ...Base,
  /** Present when the mark came from text; absent for an area mark. */
  quads: Quads.optional(),
  /** Colour the redaction will be filled with when applied. */
  interiorColor: Color,
})

export const AnnotationSchema = z.discriminatedUnion('type', [
  TextMarkupSchema,
  NoteSchema,
  FreeTextSchema,
  SquareSchema,
  CircleSchema,
  LineSchema,
  PolylineSchema,
  PolygonSchema,
  InkSchema,
  StampSchema,
  LoupeSchema,
  MaskSchema,
  RedactSchema,
])

/** The viewer's own state on an annotation, left out of exports. */
const VIEWER_STATE = { source: true, locked: true } as const

/** One exported annotation: the stored annotation without its viewer state. */
export const ExportedAnnotationSchema = z.discriminatedUnion('type', [
  TextMarkupSchema.omit(VIEWER_STATE),
  NoteSchema.omit(VIEWER_STATE),
  FreeTextSchema.omit(VIEWER_STATE),
  SquareSchema.omit(VIEWER_STATE),
  CircleSchema.omit(VIEWER_STATE),
  LineSchema.omit(VIEWER_STATE),
  PolylineSchema.omit(VIEWER_STATE),
  PolygonSchema.omit(VIEWER_STATE),
  InkShape.omit(VIEWER_STATE).superRefine(checkPressure),
  StampSchema.omit(VIEWER_STATE),
  LoupeSchema.omit(VIEWER_STATE),
  MaskSchema.omit(VIEWER_STATE),
  RedactSchema.omit(VIEWER_STATE),
])

export type Annotation = z.infer<typeof AnnotationSchema>
export type ExportedAnnotation = z.infer<typeof ExportedAnnotationSchema>
export type AnnotationType = Annotation['type']
export type AnnotationOfType<T extends AnnotationType> = Extract<Annotation, { type: T }>
export type TextMarkupAnnotation = z.infer<typeof TextMarkupSchema>
export type NoteAnnotation = z.infer<typeof NoteSchema>
export type FreeTextAnnotation = z.infer<typeof FreeTextSchema>
export type FreeTextStyle = z.infer<typeof FreeTextStyleSchema>
export type ShapeAnnotation = z.infer<typeof ShapeSchema>
export type LineAnnotation = z.infer<typeof LineSchema>
export type PolyAnnotation = z.infer<typeof PolySchema>
export type InkAnnotation = z.infer<typeof InkSchema>
export type StampAnnotation = z.infer<typeof StampSchema>
export type LoupeAnnotation = z.infer<typeof LoupeSchema>
export type MaskAnnotation = z.infer<typeof MaskSchema>
export type RedactAnnotation = z.infer<typeof RedactSchema>
export type LineEnding = z.infer<typeof LineEndingSchema>
/**
 * What `update` takes: any of a type's fields. A free-text `defaultStyle` may be partial; it
 * merges into the current one.
 */
export type AnnotationPatch = Annotation extends infer A
  ? A extends FreeTextAnnotation
    ? Omit<Partial<A>, 'defaultStyle'> & { defaultStyle?: Partial<FreeTextStyle> }
    : Partial<A>
  : never
// Point, Rect and Quad types come from ../geometry; the zod schemas above match them structurally.

/** Keys the store fills in; callers never supply them (except an optional `id`). */
type Generated = 'id' | 'createdAt' | 'modifiedAt' | 'source' | 'locked'
/** Keys the store derives or defaults when absent. */
type Defaulted = 'rect' | 'color' | 'opacity'

/** Builds the caller-facing shape of one member from its zod input type. */
type InputOf<I> = I extends unknown
  ? Omit<I, Generated | Defaulted> &
      Partial<Pick<I, Extract<Defaulted, keyof I>>> & { id?: string }
  : never

type FreeTextInput = z.input<typeof FreeTextSchema>
/** Free text may leave out `defaultStyle`, or any of its keys: the store fills the text colour. */
type FreeTextCallerInput = Omit<InputOf<FreeTextInput>, 'defaultStyle'> & {
  defaultStyle?: Partial<z.input<typeof FreeTextStyleSchema>>
}

type RedactInput = z.input<typeof RedactSchema>
type RedactBase = Omit<InputOf<RedactInput>, 'interiorColor' | 'rect' | 'quads'> & {
  interiorColor?: string
}
type RedactCallerInput =
  | (RedactBase & { rect: RedactInput['rect']; quads?: RedactInput['quads'] })
  | (RedactBase & {
      rect?: RedactInput['rect']
      quads: NonNullable<RedactInput['quads']>
    })

/**
 * What callers pass to `add`. Built from zod input types, so fields with defaults or
 * optional fields may be omitted. A redaction needs `rect` or `quads` (the store
 * derives the other), and `interiorColor` defaults to the store's redaction colour. Free text
 * may leave out `defaultStyle`; its text colour defaults to the store's free-text colour.
 */
export type AnnotationInput =
  | InputOf<
      | z.input<typeof TextMarkupSchema>
      | z.input<typeof NoteSchema>
      | z.input<typeof ShapeSchema>
      | z.input<typeof LineSchema>
      | z.input<typeof PolySchema>
      | z.input<typeof InkSchema>
    >
  | (InputOf<z.input<typeof StampSchema>> & { rect: z.input<typeof StampSchema>['rect'] })
  | (InputOf<z.input<typeof LoupeSchema>> & { rect: z.input<typeof LoupeSchema>['rect'] })
  | (InputOf<z.input<typeof MaskSchema>> & { rect: z.input<typeof MaskSchema>['rect'] })
  | FreeTextCallerInput
  | RedactCallerInput

export const AnnotationDocumentSchema = z.object({
  format: z.literal(GLOSS_FORMAT),
  version: z.literal(GLOSS_VERSION),
  documentKey: z.string().optional(),
  /** Validated item by item on import so unknown types can be preserved. */
  annotations: z.array(z.unknown()),
  /** Form field values by full name, validated field by field against the form on import. */
  fields: z.record(z.string(), z.unknown()).optional(),
})

/**
 * An item whose `type` this version does not know, such as one from a newer writer. It is kept
 * as-is so it survives an import and export round trip.
 */
export type ForeignAnnotation = UnknownAnnotation

/** A Gloss document holding Inkbar's annotations and any foreign items it kept. */
export interface AnnotationDocument {
  format: GlossDocument['format']
  version: GlossDocument['version']
  documentKey?: string
  annotations: Array<GlossAnnotation | ForeignAnnotation>
  /** Form field values by full name: each field that has one and is not no-export. */
  fields?: Record<string, FieldValue>
}
