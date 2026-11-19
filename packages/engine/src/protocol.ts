import type { EngineErrorCode, RefusalReason, UnremovableKind } from './errors.ts'
import type {
  OpenOptions,
  RedactInput,
  RedactionRegion,
  SaveMode,
  WriteInput,
} from './types.ts'

export type Request =
  | { op: 'open'; bytes: Uint8Array; options?: OpenOptions }
  | { op: 'pageInfo'; doc: number; index: number }
  | { op: 'renderPage'; doc: number; index: number; scale: number; annotations: boolean }
  | { op: 'write'; doc: number; input: WriteInput }
  | { op: 'redact'; doc: number; input: RedactInput }
  | { op: 'save'; doc: number; mode?: SaveMode | undefined }
  | { op: 'close'; doc: number }
  | {
      op: 'checkRedaction'
      bytes: Uint8Array
      options: { password?: string; regions?: readonly RedactionRegion[] }
    }

export interface Transport {
  call<T>(request: Request, signal?: AbortSignal): Promise<T>
  destroy(): Promise<void>
}

/** Messages between the page and the worker. */
export type ToWorker =
  { type: 'init'; wasm: string | Uint8Array } | { id: number; request: Request }

/** An `EngineError` or, marked by `range`, a `RangeError`. */
export type WireError =
  | {
      range?: undefined
      code: EngineErrorCode
      message: string
      pdfiumError?: number
      annotation?: string
      page?: number
      reason?: RefusalReason
      marks?: string[]
      kinds?: UnremovableKind[]
    }
  | { range: true; message: string }

export type FromWorker =
  | { type: 'ready' }
  | { type: 'failed'; error: WireError }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: WireError }
