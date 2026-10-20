import { z } from 'zod'

import { INTENTS, LINE_ENDINGS, NOTE_ICONS, pdfNameSet } from './pdf-names'

export const ANNOTATION_FORMAT = 'inkbar/annotations'
export const ANNOTATION_VERSION = 1

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB')

export const PointSchema = z.object({ x: z.number(), y: z.number() })
export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})
export const QuadSchema = z.object({
  p1: PointSchema,
  p2: PointSchema,
  p3: PointSchema,
  p4: PointSchema,
})

const Base = z.object({
  /** Client id, UUIDv7, assigned at creation and never reassigned. Embedded annotations use `pdf:<ref>`. */
  id: z.string().min(1),
  /** 0-based page index. */
  page: z.number().int().nonnegative(),
  /** Bounding box in PDF user space. */
  rect: RectSchema,
  /** Resolved #RRGGBB. Written into the PDF later, so it is always concrete. */
  color: Hex,
  opacity: z.number().min(0).max(1),
  author: z.string().optional(),
  contents: z.string().optional(),
  /** Id of the parent note; replies form threads. */
  inReplyTo: z.string().optional(),
  /** ISO 8601 date-time. */
  createdAt: z.iso.datetime({ offset: true }),
  /** ISO 8601 date-time. */
  modifiedAt: z.iso.datetime({ offset: true }),
  /** Created in this session, or imported from the file. Viewer state, never exported. */
  source: z.enum(['session', 'pdf']),
  /** Embedded annotations are locked until the engine can rewrite the file. Viewer state, never exported. */
  locked: z.boolean().optional(),
  /** Short label for what the mark is (XFDF `subject`). */
  subject: z.string().optional(),
  /** What the mark is for, e.g. a callout or an arrow (XFDF `intent`, a PDF name). */
  intent: pdfNameSet(INTENTS).optional(),
  /** Host data. Preserved, never interpreted. */
  custom: z.record(z.string(), z.unknown()).optional(),
})

export const TextMarkupSchema = Base.extend({
  type: z.enum(['highlight', 'underline', 'strikeout', 'squiggly']),
  quads: z.array(QuadSchema).min(1),
})

/** A note's icon (XFDF `icon`): a PDF name, so a name Inkbar does not know is kept. */
export const NoteIconSchema = pdfNameSet(NOTE_ICONS)

export const NoteSchema = Base.extend({
  type: z.literal('text'),
  icon: NoteIconSchema.default('Note'),
})

/** Dash pattern in points, on then off, repeating. Absent means solid. */
const DashesSchema = z.array(z.number().nonnegative()).min(1).optional()

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
  fontFamily: z.string().min(1).default('Helvetica'),
  /** Points. */
  fontSize: z.number().positive().default(12),
  /** The text colour. */
  color: Hex,
  textAlign: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  fontWeight: z.literal('bold').optional(),
  fontStyle: z.literal('italic').optional(),
  textDecoration: z.literal('underline').optional(),
  align: Refused,
})

/**
 * Free text, as XFDF has it: `color` is the box's fill and the text style lives in
 * `defaultStyle`. A box in the older shape (top-level `fontFamily`, `fontSize`, `align`) is
 * refused rather than silently losing its style; other unknown keys are dropped.
 */
export const FreeTextSchema = Base.extend({
  type: z.literal('freetext'),
  /** The text shown on the page. */
  contents: z.string(),
  /** The box's fill (XFDF `color`). Absent means no fill. */
  color: Hex.optional(),
  /** The border's colour. An extension, not XFDF. */
  borderColor: Hex.optional(),
  /** The border's width in points; 0 draws no border. */
  width: z.number().nonnegative().default(0),
  dashes: DashesSchema,
  /** Points. An extension, not XFDF. */
  cornerRadius: z.number().nonnegative().optional(),
  defaultStyle: FreeTextStyleSchema,
  callout: z.array(PointSchema).min(2).max(3).optional(),
  fontFamily: Refused,
  fontSize: Refused,
  align: Refused,
})

const ShapeFields = {
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  interiorColor: Hex.optional(),
}

export const SquareSchema = Base.extend({
  type: z.literal('square'),
  ...ShapeFields,
  /** The corner radius in points. An extension, not XFDF. */
  cornerRadius: z.number().nonnegative().optional(),
})

export const CircleSchema = Base.extend({
  type: z.literal('circle'),
  ...ShapeFields,
  cornerRadius: Refused,
})

export const ShapeSchema = z.discriminatedUnion('type', [SquareSchema, CircleSchema])

/** A line ending (XFDF `head`/`tail`): a PDF name, so a name Inkbar does not know is kept. */
export const LineEndingSchema = pdfNameSet(LINE_ENDINGS)

export const LineSchema = Base.extend({
  type: z.literal('line'),
  start: PointSchema,
  end: PointSchema,
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  head: LineEndingSchema.optional(),
  tail: LineEndingSchema.optional(),
})

const PolyFields = {
  vertices: z.array(PointSchema).min(2),
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  interiorColor: Hex.optional(),
}

export const PolylineSchema = Base.extend({
  type: z.literal('polyline'),
  ...PolyFields,
  /** The ending at the first vertex. */
  head: LineEndingSchema.optional(),
  /** The ending at the last vertex. */
  tail: LineEndingSchema.optional(),
})

export const PolygonSchema = Base.extend({
  type: z.literal('polygon'),
  ...PolyFields,
  head: Refused,
  tail: Refused,
})

export const PolySchema = z.discriminatedUnion('type', [PolylineSchema, PolygonSchema])

const InkShape = Base.extend({
  type: z.literal('ink'),
  inklist: z.array(z.array(PointSchema).min(1)).min(1),
  /** Pen pressure per sample, 0 to 1, shaped like `inklist`. Absent for mouse input. */
  pressure: z.array(z.array(z.number().min(0).max(1))).optional(),
  width: z.number().nonnegative().default(2),
  /** Kept so imported dashed ink round-trips. Inkbar draws ink solid. */
  dashes: DashesSchema,
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
export const IMAGE_DATA_URL = /^data:image\/(png|jpeg);base64,/

/**
 * An image on the page (XFDF `stamp`), drawn to fill `rect`. Image and typed signatures are
 * stamps with `subject: 'Signature'`.
 */
export const StampSchema = Base.extend({
  type: z.literal('stamp'),
  /** A PNG or JPEG `data:` URL (XFDF `imagedata`). */
  imagedata: z.string().regex(IMAGE_DATA_URL, 'expected a PNG or JPEG data URL'),
  /**
   * Quarter turns, in degrees anticlockwise, the image is turned within `rect` (XFDF
   * `rotation`). Absent means upright in user space.
   */
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
})

/**
 * A loupe (an extension, not XFDF): a circle inscribed in `rect` that shows the page content
 * under its own centre, magnified. `color` and `width` draw its rim.
 */
export const LoupeSchema = Base.extend({
  type: z.literal('loupe'),
  /** How many times larger the content under the centre is drawn. Above 1. */
  magnification: z.number().gt(1).default(2),
  /** The rim's width in points. */
  width: z.number().nonnegative().default(2),
})

/**
 * A mask (an extension, not XFDF): dims everything on the page outside `shape` drawn in
 * `rect`, an ellipse inscribed in it or the rectangle itself. `color` is the dimming colour
 * (black by default) and `dim` how strongly it covers. One per page: adding a second replaces
 * the first.
 */
export const MaskSchema = Base.extend({
  type: z.literal('mask'),
  shape: z.enum(['rect', 'ellipse']),
  /** Opacity of the dimming, 0 (none) to 1 (opaque). */
  dim: z.number().min(0).max(1).default(0.5),
})

export const SuggestionSchema = z.object({
  jobId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  explanation: z.string().optional(),
  recommendation: z.enum(['redact', 'review', 'keep']).optional(),
})

export const RedactSchema = Base.extend({
  type: z.literal('redact'),
  /** Present when the mark came from text; absent for an area mark. */
  quads: z.array(QuadSchema).min(1).optional(),
  origin: z.enum(['user', 'suggested']).default('user'),
  suggestion: SuggestionSchema.optional(),
  overlayText: z.string().optional(),
  /** Colour the redaction will be filled with when applied. */
  interiorColor: Hex,
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
export type Suggestion = z.infer<typeof SuggestionSchema>
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
  format: z.literal(ANNOTATION_FORMAT),
  version: z.literal(ANNOTATION_VERSION),
  documentKey: z.string().optional(),
  /** Validated item by item on import so unknown types can be preserved. */
  annotations: z.array(z.unknown()),
})

/**
 * An item whose `type` this version does not know, written by a newer Inkbar. It is kept as-is
 * so it survives an import and export round trip, and it is valid only under the schema
 * version that produced it.
 */
export type ForeignAnnotation = { type: string; id: string; page: number } & Record<
  string,
  unknown
>

export interface AnnotationDocument {
  format: typeof ANNOTATION_FORMAT
  version: typeof ANNOTATION_VERSION
  documentKey?: string
  annotations: Array<ExportedAnnotation | ForeignAnnotation>
}

export type ConfidenceBucket = 'low' | 'medium' | 'high'

export function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence < 0.5) return 'low'
  if (confidence < 0.8) return 'medium'
  return 'high'
}
