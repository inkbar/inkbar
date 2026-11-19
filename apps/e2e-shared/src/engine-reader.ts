/*
 * The engine-reader route: `?reader=engine` turns on core's internal switch for drawing pages
 * with the engine, before the app mounts the viewer. Only that route sets it.
 */
import type { InkDocument } from '@inkbar/core'

/** Whether the URL asks for the engine-reader route; if so, the switch is on from here. */
export function engineReaderRoute(params: URLSearchParams): boolean {
  if (params.get('reader') !== 'engine') return false
  ;(globalThis as { __INKBAR_READER__?: unknown }).__INKBAR_READER__ = 'engine'
  return true
}

/** Which reader draws `doc`'s pages: `engine` or `pdfjs`. Internal to core; read for tests. */
export const readerOf = (doc: InkDocument): string =>
  (doc as unknown as { _reader: { kind: string } })._reader.kind
