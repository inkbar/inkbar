// What the reader tells the document about the file itself: its annotations as they stand in the
// file, and the facts of its trailer and Info dictionary.

/**
 * @internal One annotation of a page that is listed (see `listed` in engine-reader/links.ts).
 * Colours are RGB, each 0–255.
 */
export interface FileAnnotation {
  /** The object reference as core writes it: `12R`, `12R3`. Invented for a direct object. */
  id: string
  subtype: string
  /** `/Rect` in user space, as written: its corners are not put in order. */
  rect: [number, number, number, number]
  hasAppearance: boolean
  /** `/QuadPoints`, flat. */
  quads?: number[]
  color?: [number, number, number]
  interiorColor?: [number, number, number]
  opacity?: number
  contents?: string
  author?: string
  /** `/CreationDate` as written. */
  created?: string
  /** `/M` as written. */
  modified?: string
  /**
   * A note's `/Name`. PDF.js gives `Note` when there is none and `NoIcon` when the note has an
   * appearance stream, whatever its `/Name`.
   */
  icon?: string
  /** The id of the annotation `/IRT` names. */
  inReplyTo?: string
  /** `/IT`. */
  intent?: string
  /** A Line's `/L`. */
  line?: [number, number, number, number]
  /** `/LE`. */
  lineEndings?: [string, string]
  /** A Polygon's or PolyLine's `/Vertices`, flat. */
  vertices?: number[]
  /** `/InkList`, each path flat. */
  inkLists?: number[][]
  border?: { width: number }
  /** What `/DA` sets. */
  defaultAppearance?: {
    fontSize: number
    fontName?: string
    color?: [number, number, number]
  }
}

/** @internal */
export interface FileFacts {
  title?: string
  author?: string
  encrypted: boolean
}
