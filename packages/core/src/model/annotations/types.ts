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
  createdAt: z.string(),
  modifiedAt: z.string(),
  /** Created in this session, or imported from the file. */
  source: z.enum(['session', 'pdf']),
  /** Embedded annotations are locked until the engine can rewrite the file. */
  locked: z.boolean().optional(),
  /** Host data. Preserved, never interpreted. */
  custom: z.record(z.string(), z.unknown()).optional(),
})

export const TextMarkupSchema = Base.extend({
  type: z.enum(['highlight', 'underline', 'strikeout', 'squiggly']),
  quads: z.array(QuadSchema).min(1),
})

export const NoteSchema = Base.extend({
  type: z.literal('note'),
  icon: z
    .enum(['comment', 'note', 'help', 'insert', 'key', 'paragraph'])
    .default('comment'),
})

export const FreeTextSchema = Base.extend({
  type: z.literal('freeText'),
  text: z.string(),
  fontSize: z.number().positive().default(12),
  fontFamily: z.string().default('Helvetica'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  callout: z.array(PointSchema).min(2).max(3).optional(),
})

export const ShapeSchema = Base.extend({
  type: z.enum(['square', 'circle']),
  strokeWidth: z.number().nonnegative().default(1),
  fill: Hex.optional(),
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
  strokeWidth: z.number().nonnegative().default(1),
  endings: z.tuple([LineEndingSchema, LineEndingSchema]).optional(),
})

export const PolySchema = Base.extend({
  type: z.enum(['polyline', 'polygon']),
  vertices: z.array(PointSchema).min(2),
  strokeWidth: z.number().nonnegative().default(1),
  fill: Hex.optional(),
})

export const InkSchema = Base.extend({
  type: z.literal('ink'),
  paths: z.array(z.array(PointSchema).min(1)).min(1),
  strokeWidth: z.number().nonnegative().default(2),
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
  fill: Hex,
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

export type Annotation = z.infer<typeof AnnotationSchema>
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
type RedactBase = Omit<InputOf<RedactInput>, 'fill' | 'rect' | 'quads'> & {
  fill?: string
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
 * derives the other), and `fill` defaults to the store's redaction colour.
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

export interface AnnotationDocument {
  format: typeof ANNOTATION_FORMAT
  version: typeof ANNOTATION_VERSION
  documentKey?: string
  annotations: Annotation[]
}

export type ConfidenceBucket = 'low' | 'medium' | 'high'

export function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence < 0.5) return 'low'
  if (confidence < 0.8) return 'medium'
  return 'high'
}
