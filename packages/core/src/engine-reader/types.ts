// What the engine reader asks of @inkbar/engine, declared by shape: core names nothing from the
// engine, and the loader's public type stays the saver's.
import type { Rect } from '../model/geometry'

/** @internal The engine's open document, as far as drawing pages needs it. */
export interface ReaderEngineDocument {
  readonly pageCount: number
  pageInfo(index: number): Promise<{
    width: number
    height: number
    rotation: 0 | 90 | 180 | 270
    box: Rect
    userUnit: number
  }>
  renderPage(
    index: number,
    options: {
      region?: Rect
      size?: { width: number; height: number }
      rotation?: 0 | 90 | 180 | 270
      hide?: readonly number[]
      signal?: AbortSignal
    }
  ): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
    missingFonts: readonly string[]
  }>
  close(): Promise<void>
}

/** @internal The engine, as far as drawing pages needs it. */
export interface ReaderEngine {
  open(bytes: Uint8Array, options?: { password?: string }): Promise<ReaderEngineDocument>
  destroy(): Promise<void>
}
