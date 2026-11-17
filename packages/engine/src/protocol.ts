import type { EngineErrorCode } from './errors.ts'
import type { OpenOptions, SaveMode } from './types.ts'

export type Request =
  | { op: 'open'; bytes: Uint8Array; options?: OpenOptions }
  | { op: 'pageInfo'; doc: number; index: number }
  | { op: 'renderPage'; doc: number; index: number; scale: number; annotations: boolean }
  | { op: 'save'; doc: number; mode: SaveMode }
  | { op: 'close'; doc: number }

export interface Transport {
  call<T>(request: Request, signal?: AbortSignal): Promise<T>
  destroy(): Promise<void>
}

/** Messages between the page and the worker. */
export type ToWorker =
  { type: 'init'; wasm: string | Uint8Array } | { id: number; request: Request }

/** An `EngineError` or, marked by `range`, a `RangeError`. */
export type WireError =
  | { range?: undefined; code: EngineErrorCode; message: string; pdfiumError?: number }
  | { range: true; message: string }

export type FromWorker =
  | { type: 'ready' }
  | { type: 'failed'; error: WireError }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: WireError }
