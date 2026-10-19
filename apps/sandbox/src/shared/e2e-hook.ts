import type { InkDocument } from '@inkbar/core'

declare global {
  interface Window {
    /** The open document, for the end-to-end suite to reach in a production build. */
    __inkbarSandboxDocument?: InkDocument | undefined
  }
}

/** Publishes the open document on `window`; pass `null` when it closes. */
export function exposeDocument(doc: InkDocument | null): void {
  window.__inkbarSandboxDocument = doc ?? undefined
}
