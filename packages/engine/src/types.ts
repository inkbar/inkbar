/** Options for `Engine.open`. */
export interface OpenOptions {
  /** Password for an encrypted document. An empty string counts as no password. */
  password?: string
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
  /** Default `'rewrite'`. */
  mode?: SaveMode
}
