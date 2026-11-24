import { EngineError } from '../errors.ts'
import {
  TEXT_GEOMETRY_STRIDE,
  type PageText,
  type StandardFontName,
  type TextFont,
} from '../types.ts'

import type { Heap } from './strings.ts'

const FONT_KEYS = ['fixedPitch', 'serif', 'italic', 'bold', 'vertical'] as const
const METRIC_KEYS = [
  'ascent',
  'descent',
  'descriptorAscent',
  'descriptorDescent',
] as const
const STANDARD_FONTS: ReadonlySet<string> = new Set<StandardFontName>([
  'Courier',
  'Courier-Bold',
  'Courier-BoldOblique',
  'Courier-Oblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-BoldOblique',
  'Helvetica-Oblique',
  'Times-Roman',
  'Times-Bold',
  'Times-BoldItalic',
  'Times-Italic',
  'Symbol',
  'ZapfDingbats',
])

const finiteOrNull = (value: unknown): boolean =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

function fail(message: string, cause?: unknown): EngineError {
  return new EngineError('engine-failure', message, cause === undefined ? {} : { cause })
}

/** The font table the fork wrote, checked: an array of the eleven-key objects. */
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
  const bad = (key: string, expected: string) =>
    fail(
      "A page's font table could not be read.",
      new Error(`${key}: expected ${expected}`)
    )
  if (!Array.isArray(parsed)) throw bad('root', 'a list')
  return parsed.map((entry: unknown): TextFont => {
    if (typeof entry !== 'object' || entry === null) throw bad('entry', 'an object')
    const item = entry as Record<string, unknown>
    if (typeof item.name !== 'string') throw bad('name', 'a string')
    const flag = FONT_KEYS.find((k) => typeof item[k] !== 'boolean')
    if (flag) throw bad(flag, 'a boolean')
    const metric = METRIC_KEYS.find((k) => !finiteOrNull(item[k]))
    if (metric) throw bad(metric, 'a finite number or null')
    if (!(item.standard === null || STANDARD_FONTS.has(item.standard as string)))
      throw bad('standard', 'a standard 14 font name or null')
    return {
      name: item.name,
      fixedPitch: item.fixedPitch as boolean,
      serif: item.serif as boolean,
      italic: item.italic as boolean,
      bold: item.bold as boolean,
      vertical: item.vertical as boolean,
      ascent: item.ascent as number | null,
      descent: item.descent as number | null,
      descriptorAscent: item.descriptorAscent as number | null,
      descriptorDescent: item.descriptorDescent as number | null,
      standard: item.standard as StandardFontName | null,
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
    const cut = fn.INK_Text_Truncated(text)
    if (cut !== 0 && cut !== 1)
      throw fail(
        "A page's characters could not be read.",
        new Error(`INK_Text_Truncated: expected 0 or 1, got ${cut}`)
      )
    const truncated = cut === 1
    if (count === 0)
      return {
        count,
        codes: new Uint32Array(0),
        geometry: new Float32Array(0),
        flags: new Uint8Array(0),
        fonts: new Uint16Array(0),
        fontTable,
        truncated,
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
      truncated,
    }
  } finally {
    if (!heap.stopped) fn.INK_Text_Free(text)
  }
}
