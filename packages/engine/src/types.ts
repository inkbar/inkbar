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
 * A page's size and rotation. Sizes are in user-space units and describe the page box: the crop
 * box intersected with the media box, or the media box when the page has no crop box. A unit is a
 * PDF point (1/72 inch) unless the page has a /UserUnit; multiply by `userUnit` for points. They
 * are taken before /Rotate is applied, so a page rotated by 90 degrees keeps its unrotated width
 * and height.
 */
export interface PageInfo {
  /** Width in user-space units, before /Rotate. */
  width: number
  /** Height in user-space units, before /Rotate. */
  height: number
  /** The page's /Rotate entry in degrees clockwise, reduced to 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270
  /**
   * The page box in PDF user space, before /Rotate: where `width` by `height` sits on the page's
   * coordinate plane. Its origin is the corner of the crop box, so it is not always (0, 0).
   */
  box: Rect
  /** The page's `/UserUnit`: the size of one user-space unit in points. 1 when the page has none. */
  userUnit: number
}

/** Options for `EngineDocument.renderPage`. */
export interface RenderOptions {
  /**
   * Pixels per user-space unit, which is a PDF point unless the page has a /UserUnit. Default 1
   * when there is no `size`. It must be a finite number above 0. A scale that gives a bitmap of
   * more than 268,435,456 pixels is a `RangeError`. Not with `size`.
   */
  scale?: number
  /**
   * Cancels the render while it waits in the queue, and stops it once it has started: it then
   * rejects with `aborted` within a few milliseconds and delivers no pixels. A render that
   * finishes before the abort is seen still resolves. Every other call that has started runs to
   * the end.
   */
  signal?: AbortSignal
  /**
   * Draw the page's annotations, form widgets included. Default true. With false only the
   * page's own content is drawn, so a caller that paints annotations itself does not draw them
   * twice.
   */
  annotations?: boolean
  /**
   * The part of the page to draw, in user space. Default: the whole page box. The part outside
   * the page box is white. Its width and height must be finite and above 0.
   */
  region?: Rect
  /**
   * The exact bitmap size in pixels, each a whole number from 1. The region is stretched to fill
   * it, so its two sides may scale differently. Not with `scale`.
   */
  size?: { width: number; height: number }
  /** A turn clockwise on top of the page's /Rotate. Default 0. */
  rotation?: 0 | 90 | 180 | 270
  /**
   * Object numbers of annotations on this page whose appearance is not drawn. Each is a whole
   * number from 1; at most 1,000,000 of them. The document is not changed, so a later `save` is
   * as it would have been.
   */
  hide?: readonly number[]
}

/**
 * A rendered page. The bitmap is in displayed orientation, after /Rotate and any `rotation`. Its
 * width and height are the `size` asked, or else the displayed size of the region times the
 * scale, rounded up to whole pixels.
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
  /**
   * Fallback fonts this page needed and did not get: no entry in `fallbackFonts`, or the fetch
   * failed. Empty when none.
   */
  missingFonts: readonly FontKey[]
}

/**
 * A fallback font, for text whose font is not in the file: one for each script that needs its
 * own, and `default` for the rest that a file can name without embedding, such as Cyrillic and
 * Greek.
 */
export type FontKey =
  'japanese' | 'simplified-chinese' | 'traditional-chinese' | 'korean' | 'default'

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

/** A place `Engine.checkRedaction` looks under: one mark's quads on a page. */
export interface RedactionRegion {
  /** Page index, counting from 0. */
  page: number
  /**
   * The quads the region covers, in PDF user space: Gloss quads, `p1` top left, `p2` top right,
   * `p3` bottom left and `p4` bottom right. At least one.
   */
  quads: readonly Quad[]
}

/** Options for `Engine.checkRedaction`. */
export interface CheckRedactionOptions {
  /** Password for an encrypted file. An empty string counts as no password. */
  password?: string
  /**
   * The regions to check. Each must be clean. Without them the check looks for candidates
   * itself: Redact annotations, filled boxes and annotations drawn as opaque boxes.
   *
   * With regions the check trusts the `/INKB_Overlay` tag an apply puts on the overlay it leaves,
   * and counts nothing inside a tagged form. Any file can carry that tag, so a check with regions
   * proves nothing about a file the engine did not just produce. Check a file from elsewhere
   * without regions.
   */
  regions?: readonly RedactionRegion[]
  /** Cancels the call while it waits in the queue. */
  signal?: AbortSignal
}

/** A place the check looked under, and what it found there. */
export interface RedactionCandidate {
  /** Page index, counting from 0. */
  page: number
  /**
   * For `kind: 'region'`, the index of the region this candidate answers in the `regions` list
   * given. Absent for every other kind.
   */
  region?: number
  /** The place, in PDF user space: the bounds of a region's quads, or of a candidate. */
  rect: Rect
  /**
   * `region`: one of the regions given. `redact-annotation`: a Redact annotation in the file.
   * `filled-box`: an opaque filled rectangle in the page content. `annotation-box`: a Square,
   * Highlight or Stamp annotation drawn as an opaque filled rectangle.
   */
  kind: 'region' | 'redact-annotation' | 'filled-box' | 'annotation-box'
  /** Text that text extraction can read under it, in the page, a form, an annotation or a pattern. */
  text: 'none' | 'present'
  /** Image samples under it that are not one flat value. */
  image: 'none' | 'present'
  /** Vector paths or shadings crossing it. Always `none` for a filled box or an annotation box. */
  drawing: 'none' | 'present'
  /**
   * `unapplied`: a Redact annotation with content under it. `content-remains`: any other
   * candidate with content under it. `clean`: nothing found under it.
   */
  verdict: 'clean' | 'content-remains' | 'unapplied'
}

/** What `Engine.checkRedaction` found. It holds places, counts and flags, never text from the file. */
export interface RedactionFindings {
  /**
   * Page by page; on a page, regions in the order given, or candidates in the file's order. A
   * region's candidate names its place in the list given in `region`.
   */
  candidates: RedactionCandidate[]
  file: {
    /** Revisions kept before the last one, which may hold the original content. */
    earlierVersions: number
    /** Whether the file has a document information dictionary or XMP metadata. */
    metadata: boolean
    /** The number of attached files. */
    attachments: number
    /** Whether the file holds JavaScript or script actions. */
    scripts: boolean
    /** Whether the file has layers that are hidden. */
    hiddenLayers: boolean
    /** Whether the file holds a digital signature. */
    signed: boolean
  }
}
