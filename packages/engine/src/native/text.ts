import { EngineError } from '../errors.ts'
import { TEXT_GEOMETRY_STRIDE, type PageText, type TextFont } from '../types.ts'

import type { Heap } from './strings.ts'

const FONT_KEYS = ['fixedPitch', 'serif', 'italic', 'bold', 'vertical'] as const

function fail(message: string, cause?: unknown): EngineError {
  return new EngineError('engine-failure', message, cause === undefined ? {} : { cause })
}

/** The font table the fork wrote, checked: an array of the six-key objects. */
function readFontTable(heap: Heap, pointer: number): TextFont[] {
  const bytes = heap.native.HEAPU8
  const end = pointer === 0 ? -1 : bytes.indexOf(0, pointer)
  if (end < 0) throw fail("A page's font table could not be read.")
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(pointer, end)))
  } catch (cause) {
    throw fail("A page's font table could not be read.", cause)
  }
  if (!Array.isArray(parsed)) throw fail("A page's font table could not be read.")
  return parsed.map((entry: unknown): TextFont => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >
    if (
      typeof item.name !== 'string' ||
      FONT_KEYS.some((k) => typeof item[k] !== 'boolean')
    )
      throw fail("A page's font table could not be read.")
    return {
      name: item.name,
      fixedPitch: item.fixedPitch as boolean,
      serif: item.serif as boolean,
      italic: item.italic as boolean,
      bold: item.bold as boolean,
      vertical: item.vertical as boolean,
    }
  })
}

/**
 * A page's characters, copied out of engine memory. Every array owns its buffer, so none is a
 * view on the module's memory, which can grow or be reused. The fork's block is freed after.
 */
export function readPageText(heap: Heap, doc: number, index: number): PageText {
  const { fn, native } = heap
  const text = fn.INK_Text_Page(doc, index)
  if (text === 0)
    throw new EngineError('engine-failure', `Page ${index} could not be loaded.`, {
      pdfiumError: fn.FPDF_GetLastError(),
    })
  try {
    const count = fn.INK_Text_Count(text)
    const fontTable = readFontTable(heap, fn.INK_Text_FontTable(text))
    if (count === 0)
      return {
        count,
        codes: new Uint32Array(0),
        geometry: new Float32Array(0),
        flags: new Uint8Array(0),
        fonts: new Uint16Array(0),
        fontTable,
      }
    const memory = native.HEAPU8.buffer
    const at = (pointer: number, size: number, align: number) => {
      if (pointer === 0 || pointer % align !== 0 || pointer + size > memory.byteLength)
        throw fail("A page's characters could not be read.")
      return pointer
    }
    const codes = at(fn.INK_Text_Codes(text), count * 4, 4)
    const geometry = at(fn.INK_Text_Geometry(text), count * TEXT_GEOMETRY_STRIDE * 4, 4)
    const flags = at(fn.INK_Text_Flags(text), count, 1)
    const fonts = at(fn.INK_Text_Fonts(text), count * 2, 2)
    return {
      count,
      codes: new Uint32Array(memory, codes, count).slice(),
      geometry: new Float32Array(memory, geometry, count * TEXT_GEOMETRY_STRIDE).slice(),
      flags: new Uint8Array(memory, flags, count).slice(),
      fonts: new Uint16Array(memory, fonts, count).slice(),
      fontTable,
    }
  } finally {
    if (!heap.stopped) fn.INK_Text_Free(text)
  }
}
