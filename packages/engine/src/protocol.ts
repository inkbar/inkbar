import type { OpenOptions, SaveMode } from './types.ts'

export type Request =
  | { op: 'open'; bytes: Uint8Array; options?: OpenOptions }
  | { op: 'pageInfo'; doc: number; index: number }
  | { op: 'renderPage'; doc: number; index: number; scale: number }
  | { op: 'save'; doc: number; mode: SaveMode }
  | { op: 'close'; doc: number }

export interface Transport {
  call<T>(request: Request, signal?: AbortSignal): Promise<T>
  destroy(): Promise<void>
}
