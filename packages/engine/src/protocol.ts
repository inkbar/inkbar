import type { EngineErrorCode, RefusalReason, UnremovableKind } from './errors.ts'
import type {
  AnnotationRenderOptions,
  FontKey,
  OpenOptions,
  RedactInput,
  RedactionRegion,
  RenderOptions,
  SaveMode,
  WriteInput,
} from './types.ts'

/** `RenderOptions` as they cross to the worker: everything but the signal. */
export type RenderRequestOptions = Omit<RenderOptions, 'signal'>

/** `AnnotationRenderOptions` as they cross to the worker: everything but the signal. */
export type AnnotationRequestOptions = Omit<AnnotationRenderOptions, 'signal'>

export type Request =
  | { op: 'open'; bytes: Uint8Array; options?: OpenOptions }
  | { op: 'pageInfo'; doc: number; index: number }
  | { op: 'pageText'; doc: number; index: number }
  | { op: 'pageLinks'; doc: number; index: number }
  | { op: 'documentFacts'; doc: number }
  | { op: 'pageAnnotations'; doc: number; index: number }
  | { op: 'formFields'; doc: number }
  | { op: 'scripts'; doc: number }
  | { op: 'structureOrder'; doc: number; index: number }
  | { op: 'outline'; doc: number }
  | { op: 'namedDestination'; doc: number; name: Uint8Array }
  | { op: 'renderPage'; doc: number; index: number; options: RenderRequestOptions }
  | {
      op: 'renderAnnotations'
      doc: number
      index: number
      options: AnnotationRequestOptions
    }
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
  call<T>(
    request: Request,
    signal?: AbortSignal,
    options?: { background?: boolean }
  ): Promise<T>
  destroy(): Promise<void>
}

/**
 * Messages between the page and the worker. `abort` asks the worker to stop call `id` if it is a
 * render or annotation draw still running, or a text read, write or redact still waiting for a
 * fallback font; for any other
 * call it changes nothing.
 */
export type ToWorker =
  | {
      type: 'init'
      wasm: string | Uint8Array
      /** Absolute URLs or bytes, per key. */
      fallbackFonts?: Partial<Record<FontKey, string | Uint8Array>>
    }
  | { type: 'abort'; id: number }
  | { id: number; request: Request }

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
