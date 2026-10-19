import { z } from 'zod'

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
  /** What the mark is for, e.g. a callout or an arrow (XFDF `intent`). */
  intent: z.string().optional(),
  /** Host data. Preserved, never interpreted. */
  custom: z.record(z.string(), z.unknown()).optional(),
})

export const TextMarkupSchema = Base.extend({
  type: z.enum(['highlight', 'underline', 'strikeout', 'squiggly']),
  quads: z.array(QuadSchema).min(1),
})

export const NoteSchema = Base.extend({
  type: z.literal('text'),
  icon: z
    .enum(['comment', 'note', 'help', 'insert', 'key', 'paragraph'])
    .default('comment'),
})

export const FreeTextSchema = Base.extend({
  type: z.literal('freetext'),
  /** The text shown on the page. */
  contents: z.string(),
  fontSize: z.number().positive().default(12),
  fontFamily: z.string().default('Helvetica'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  callout: z.array(PointSchema).min(2).max(3).optional(),
})

/** Dash pattern in points, on then off, repeating. Absent means solid. */
const DashesSchema = z.array(z.number().nonnegative()).min(1).optional()

export const ShapeSchema = Base.extend({
  type: z.enum(['square', 'circle']),
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  interiorColor: Hex.optional(),
  /** Squares only: the corner radius in points. An extension, not XFDF. */
  cornerRadius: z.number().nonnegative().optional(),
})

export const LineEndingSchema = z.enum([
  'none',
  'openArrow',
  'closedArrow',
  'square',
  'circle',
  'diamond',
  'butt',
  'slash',
])

export const LineSchema = Base.extend({
  type: z.literal('line'),
  start: PointSchema,
  end: PointSchema,
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  head: LineEndingSchema.optional(),
  tail: LineEndingSchema.optional(),
})

export const PolySchema = Base.extend({
  type: z.enum(['polyline', 'polygon']),
  vertices: z.array(PointSchema).min(2),
  width: z.number().nonnegative().default(1),
  dashes: DashesSchema,
  /** Polylines only: the ending at the first vertex. */
  head: LineEndingSchema.optional(),
  /** Polylines only: the ending at the last vertex. */
  tail: LineEndingSchema.optional(),
  interiorColor: Hex.optional(),
})

export const InkSchema = Base.extend({
  type: z.literal('ink'),
  inklist: z.array(z.array(PointSchema).min(1)).min(1),
  width: z.number().nonnegative().default(2),
  dashes: DashesSchema,
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
  ShapeSchema,
  LineSchema,
  PolySchema,
  InkSchema,
  RedactSchema,
])

/** The viewer's own state on an annotation, left out of exports. */
const VIEWER_STATE = { source: true, locked: true } as const

/** One exported annotation: the stored annotation without its viewer state. */
export const ExportedAnnotationSchema = z.discriminatedUnion('type', [
  TextMarkupSchema.omit(VIEWER_STATE),
  NoteSchema.omit(VIEWER_STATE),
  FreeTextSchema.omit(VIEWER_STATE),
  ShapeSchema.omit(VIEWER_STATE),
  LineSchema.omit(VIEWER_STATE),
  PolySchema.omit(VIEWER_STATE),
  InkSchema.omit(VIEWER_STATE),
  RedactSchema.omit(VIEWER_STATE),
])

export type Annotation = z.infer<typeof AnnotationSchema>
export type ExportedAnnotation = z.infer<typeof ExportedAnnotationSchema>
export type AnnotationType = Annotation['type']
export type AnnotationOfType<T extends AnnotationType> = Extract<Annotation, { type: T }>
export type TextMarkupAnnotation = z.infer<typeof TextMarkupSchema>
export type NoteAnnotation = z.infer<typeof NoteSchema>
export type FreeTextAnnotation = z.infer<typeof FreeTextSchema>
export type ShapeAnnotation = z.infer<typeof ShapeSchema>
export type LineAnnotation = z.infer<typeof LineSchema>
export type PolyAnnotation = z.infer<typeof PolySchema>
export type InkAnnotation = z.infer<typeof InkSchema>
export type RedactAnnotation = z.infer<typeof RedactSchema>
export type Suggestion = z.infer<typeof SuggestionSchema>
export type LineEnding = z.infer<typeof LineEndingSchema>
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
 * derives the other), and `interiorColor` defaults to the store's redaction colour.
 */
export type AnnotationInput =
  | InputOf<
      | z.input<typeof TextMarkupSchema>
      | z.input<typeof NoteSchema>
      | z.input<typeof FreeTextSchema>
      | z.input<typeof ShapeSchema>
      | z.input<typeof LineSchema>
      | z.input<typeof PolySchema>
      | z.input<typeof InkSchema>
    >
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
