/*
 * The engine-reader route: `?reader=engine` turns on core's internal switch for reading the file
 * with the engine, before the app mounts the viewer. Only that route sets it.
 */
import { isFormFixture } from './form-actions'

import type { InkDocument } from '@inkbar/core'

/** Whether the URL asks for the engine-reader route; if so, the switch is on from here. */
export function engineReaderRoute(params: URLSearchParams): boolean {
  if (params.get('reader') !== 'engine') return false
  ;(globalThis as { __INKBAR_READER__?: unknown }).__INKBAR_READER__ = 'engine'
  return true
}

/**
 * Whether the engine-reader route opens `doc` on the engine-reader page. A form fixture opens on
 * the form page, and a fixture with the file's own annotations (`annotated-`) on the review page,
 * as they do without the route, each given the engine.
 */
export const onEngineReaderPage = (doc: string): boolean =>
  !isFormFixture(doc) && !doc.startsWith('annotated-')

/** Which reader draws `doc`'s pages: `engine` or `pdfjs`. Internal to core; read for tests. */
export const readerOf = (doc: InkDocument): string =>
  (doc as unknown as { _reader: { kind: string } })._reader.kind
