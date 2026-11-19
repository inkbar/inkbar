/*
 * Core's internal switch for drawing pages with the engine instead of the usual reader: a global
 * read each time a document opens. Only the sandbox, its smoke page and its measure page set it.
 */
import type { InkDocument } from '@inkbar/core'

type WithSwitch = { __INKBAR_READER__?: unknown }

/** Turns the switch on or off. A document already open keeps the reader it opened with. */
export function setEngineReader(on: boolean): void {
  const g = globalThis as WithSwitch
  if (on) g.__INKBAR_READER__ = 'engine'
  else delete g.__INKBAR_READER__
}

/** Which reader draws `doc`'s pages: `engine` or `pdfjs`. Internal to core; read for checks. */
export const readerOf = (doc: InkDocument): string =>
  (doc as unknown as { _reader: { kind: string } })._reader.kind
