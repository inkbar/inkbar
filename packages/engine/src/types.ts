import type { Annotation as GlossAnnotation, Quad } from 'gloss-format'

/** Options for `Engine.open`. */
export interface OpenOptions {
  /** Password for an encrypted document. An empty string counts as no password. */
  password?: string
}

/** A rectangle in PDF user space: points, origin at the bottom left, before /Rotate. */
export interface Rect {
  /** Left edge. */
  x: number
  /** Bottom edge. */
  y: number
  /** Width, from `x` to the right. */
  width: number
  /** Height, from `y` upward. */
  height: number
}

/**
 * A page's size and rotation. Sizes are in PDF points (1/72 inch) and describe the page box
 * PDFium reports: the crop box intersected with the media box, or the media box when the page has
 * no crop box. They are taken before /Rotate is applied, so a page rotated by 90 degrees keeps its
 * unrotated width and height.
 */
export interface PageInfo {
  /** Width in PDF points, before /Rotate. */
  width: number
  /** Height in PDF points, before /Rotate. */
  height: number
  /** The page's /Rotate entry in degrees clockwise, reduced to 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270
  /**
   * The page box in PDF user space, before /Rotate: where `width` by `height` sits on the page's
   * coordinate plane. Its origin is the corner of the crop box, so it is not always (0, 0).
   */
  box: Rect
}

/** Options for `EngineDocument.renderPage`. */
export interface RenderOptions {
  /**
   * Pixels per PDF point. Default 1. It must be a finite number above 0. A scale that gives
   * a bitmap of more than 268,435,456 pixels is a `RangeError`.
   */
  scale?: number
  /**
   * Cancels the call while it waits in the queue. A call that has started runs to the end, and
   * may still resolve or reject; the signal no longer affects it.
   */
  signal?: AbortSignal
  /**
   * Draw the page's annotations. Default true. With false only the page's own content is drawn,
   * so a caller that paints annotations itself does not draw them twice.
   */
  annotations?: boolean
}

/**
 * A rendered page. The bitmap is in displayed orientation, after /Rotate. Its width and
 * height are the displayed size times the scale, rounded up to whole pixels.
 */
export interface RenderedPage {
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
  /**
   * Straight (not premultiplied) RGBA, four bytes per pixel, rows top to bottom with no
   * padding. The page is drawn on white, so every alpha byte is 255. The array belongs to the
   * caller; the engine keeps no reference to it.
   */
  data: Uint8ClampedArray
}

/**
 * How `save` writes the document. `'rewrite'` writes the whole file anew. `'incremental'`
 * keeps the original bytes as they are and appends the changes after them.
 */
export type SaveMode = 'rewrite' | 'incremental'

/** Options for `EngineDocument.save`. */
export interface SaveOptions {
  /**
   * Default `'incremental'` when the document holds a digital signature, so the signature stays
   * verifiable, and `'rewrite'` otherwise. An empty signature field, still to be signed, does not
   * count.
   */
  mode?: SaveMode
}

/** One of the twelve core faces every PDF reader provides, by name. */
export type StandardFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique'

/**
 * How an annotation looks: a rectangle of drawing operators and the resources they name.
 * Everything is in PDF user space, in points, origin at the bottom left, before /Rotate.
 */
export interface Appearance {
  /**
   * The area the drawing fills, in the page's user space. Its width and height must be above 0:
   * a box with no area is a `RangeError` naming the annotation.
   */
  bounds: Rect
  /** PDF drawing operators. They paint inside `bounds` and may name the resources below. */
  content: Uint8Array
  /** Fonts the operators use, keyed by the name they call each one. */
  fonts?: Record<string, StandardFont>
  /** Opacity settings the operators use, keyed by name. Each value is from 0 to 1. */
  opacities?: Record<string, { fill?: number; stroke?: number }>
  /** Images the operators paint, keyed by name. */
  images?: Record<string, { format: 'png' | 'jpeg'; data: Uint8Array }>
  /** Pages of the same document whose content the operators paint, as name to page index. */
  pages?: Record<string, number>
  /**
   * Nested drawings the operators paint, keyed by name. One with `group` set is drawn as a unit,
   * as a transparency group, so overlapping parts blend as one picture.
   */
  forms?: Record<string, Appearance & { group?: boolean }>
}

/** An annotation already in the document, by the page it is on and its object number. */
export interface AnnotationRef {
  /** Page index, counting from 0. */
  page: number
  /** The object number of the annotation's dictionary in the file. */
  objectNumber: number
}

/** One annotation for `EngineDocument.write` to add to a page. */
export interface WriteAnnotation {
  /** Page index, counting from 0. */
  page: number
  /**
   * The annotation in Gloss form. Its dictionary entries are written from this, so other
   * programs can read and edit it. An annotation with `inReplyTo` is written as a reply: a hidden
   * note linked to its parent. The parent must come earlier in `WriteInput.annotations` of the
   * same call, unless `replyTo` names the parent instead. A reply whose parent comes later, or
   * not at all, rejects with `write-failed` naming the reply.
   */
  annotation: GlossAnnotation
  /**
   * An annotation already in the document that this one replies to. When given, the annotation
   * is written as a reply to it, a hidden note linked to it with no appearance, whatever its
   * `inReplyTo` says. One that names no annotation on that page, such as one removed by the
   * same call, rejects with `write-failed` naming the reply.
   */
  replyTo?: AnnotationRef
  /**
   * How the annotation looks. Its `bounds` become the annotation's rectangle. Required for
   * everything but a reply, which has none.
   */
  appearance?: Appearance
  /** Text stored with the annotation, for the caller to read back later. */
  data: string
}

/**
 * A form value for `EngineDocument.write`. A name the form lacks, or a value its field cannot
 * take, rejects with `write-failed` naming the field.
 */
export interface WriteField {
  /**
   * The field's value. A string for a text field or a combo box: one of the combo's options'
   * export values, or any text when the combo takes text of its own, or `''` to clear it. For a checkbox or a radio
   * group, the state name of the button to turn on, or `'Off'` for none. For a list box, the
   * selected options' export values, as a list: at most one unless it takes several, and an
   * empty list for none.
   */
  value: string | readonly string[]
  /**
   * What a text field or combo box shows in place of the value, when it differs, such as
   * `'$1,234.50'` for `'1234.5'`. Other fields take none.
   */
  text?: string
}

/** What `EngineDocument.write` writes into the document. */
export interface WriteInput {
  /** Annotations already in the document to remove. */
  remove?: readonly AnnotationRef[]
  /**
   * Annotations to add, each appended to its page in the order given. A reply comes after the
   * annotation it replies to.
   */
  annotations?: readonly WriteAnnotation[]
  /** Form values to set, by full field name: parent names and the field's own, joined by dots. */
  fields?: Readonly<Record<string, WriteField>>
}

/** What `EngineDocument.redact` applies and writes. */
export interface RedactInput {
  /** File annotations to remove first, such as Inkbar's earlier copies, as in `WriteInput`. */
  remove?: readonly AnnotationRef[]
  /**
   * The marks: Gloss `redact` annotations. Each one removes what lies under its `quads`, or
   * under its `rect` when it has none. Its `appearance` is the overlay left in its place.
   */
  marks: readonly WriteAnnotation[]
  /** Annotations written after the apply, as in `WriteInput`. */
  annotations?: readonly WriteAnnotation[]
  /**
   * Form values written after the apply, as in `WriteInput`. A field whose widgets a mark
   * removed is skipped and named in `RedactResult.fieldsSkipped`.
   */
  fields?: Readonly<Record<string, WriteField>>
}

/** What `EngineDocument.redact` did. It holds counts and flags, never text from the file. */
export interface RedactResult {
  /**
   * The pages where marks were applied, in page order: the marks applied there, Inkbar's
   * earlier locked marks included, and the other annotations the marks removed, pop-ups
   * included.
   */
  pages: { page: number; marks: number; annotationsRemoved: number }[]
  /**
   * Inkbar's own earlier marks applied where they came back locked, in an encrypted file. They
   * are told apart from other programs' marks by the data Inkbar stores with them.
   */
  ownLockedMarks: number
  /**
   * The regions of those marks, one entry per page where they were applied, in page order:
   * each mark's /QuadPoints, or its /Rect when it has none. Empty when there were none. Pass
   * them to `checkRedaction` with the marks given, to check what they removed.
   */
  ownLockedRegions: { page: number; quads: Quad[] }[]
  /** Redact annotations from other programs, left in the file unapplied. */
  foreignMarks: number
  /** The names of the `fields` skipped because a mark removed their widgets. */
  fieldsSkipped: string[]
  /** What sanitising found and removed from the file. */
  sanitised: {
    /** The document information dictionary or XMP metadata. */
    metadata: boolean
    /** The number of attached files. */
    attachments: number
    /** JavaScript: document scripts and script actions. */
    scripts: boolean
    /** Page thumbnails. */
    thumbnails: boolean
    /** Private application data (/PieceInfo) and links to full-resolution originals. */
    privateData: boolean
  }
  /** Whether the file as opened has layers that are hidden. They are not cleaned. */
  hiddenLayers: boolean
  /** Whether the file as opened holds a digital signature, which stops verifying. */
  signed: boolean
}
