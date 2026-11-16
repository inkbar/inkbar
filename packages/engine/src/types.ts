export interface OpenOptions {
  password?: string
}

export interface PageInfo {
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
}

export interface RenderOptions {
  scale?: number
  signal?: AbortSignal
}

export interface RenderedPage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type SaveMode = 'rewrite' | 'incremental'

export interface SaveOptions {
  mode?: SaveMode
}
