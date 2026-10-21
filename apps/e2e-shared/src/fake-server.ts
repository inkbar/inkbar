/*
 * Stands in for the host application's API: annotation storage keyed by document version.
 * Storage lives in sessionStorage, so a page reload can read back what the previous page
 * saved. Every call waits `latency` ms, like a network round trip.
 */
import type { AnnotationDocument } from '@inkbar/core'

const STORAGE_PREFIX = 'inkbar-sandbox:annotations:'

export interface FakeServer {
  load(key: string): Promise<AnnotationDocument | null>
  save(key: string, doc: AnnotationDocument): Promise<void>
}

export function storageKey(key: string): string {
  return STORAGE_PREFIX + key
}

export function createFakeServer(opts: { latency?: number } = {}): FakeServer {
  const latency = opts.latency ?? 150
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency))
  return {
    async load(key) {
      await wait()
      const raw = sessionStorage.getItem(storageKey(key))
      return raw === null ? null : (JSON.parse(raw) as AnnotationDocument)
    },
    async save(key, doc) {
      await wait()
      sessionStorage.setItem(storageKey(key), JSON.stringify(doc))
    },
  }
}
