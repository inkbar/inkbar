import { PDF_NAME } from '../model/annotations/pdf-names'

import {
  dictGet,
  isDict,
  isName,
  type PdfDict,
  type PdfRef,
  type PdfValue,
} from './lexer'

import type { PdfObjects } from './objects'

export interface FontFields {
  fontFamily?: string
  fontWeight?: 'bold'
  fontStyle?: 'italic'
}

export interface FreeTextFields {
  /** Two or three points, tip first. */
  callout?: { x: number; y: number }[]
  fringe?: { left: number; top: number; right: number; bottom: number }
  head?: string
  font?: FontFields
}

/** `12R` → {num:12,gen:0}, `12R3` → {num:12,gen:3}; anything else undefined. */
export function refOfPdfjsId(id: string): PdfRef | undefined {
  const m = /^(\d+)R(\d+)?$/.exec(id)
  if (!m) return undefined
  return { kind: 'ref', num: Number(m[1]), gen: m[2] === undefined ? 0 : Number(m[2]) }
}

const FAMILIES: [RegExp, string][] = [
  [/^(helvetica|helv)/i, 'Helvetica'],
  [/^(times|tiro)/i, 'Times'],
  [/^cour(ier|$)/i, 'Courier'],
]

/**
 * BaseFont (or bare resource name) → Inkbar font fields; undefined for Symbol and ZapfDingbats.
 * A family matches by prefix, so `HelveticaNeue` reads as Helvetica and `CourierNewPS` as
 * Courier. Any other name keeps its own family, minus a trailing `MT` or `PSMT`.
 * With `knownOnly`, a name outside Helvetica, Times and Courier gives undefined: a bare
 * resource id such as `F1` is not a family.
 */
export function fontFromBaseName(
  name: string,
  knownOnly = false
): FontFields | undefined {
  const bare = name.replace(/^[A-Z]{6}\+/, '')
  if (/^(symbol|zapfdingbats|zadb)/i.test(bare)) return undefined
  const cut = bare.search(/[-,]/)
  const base = cut < 0 ? bare : bare.slice(0, cut)
  const style = cut < 0 ? '' : bare.slice(cut + 1)
  const known = FAMILIES.find(([re]) => re.test(base))
  if (knownOnly && !known) return undefined
  const fontFamily = known ? known[1] : base.replace(/(PS)?MT$/, '')
  if (!fontFamily) return undefined
  const font: FontFields = { fontFamily }
  if (/bold|black|heavy/i.test(style)) font.fontWeight = 'bold'
  if (/italic|oblique/i.test(style)) font.fontStyle = 'italic'
  return font
}

const finite = (v: PdfValue | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v)

async function numbers(objs: PdfObjects, v: PdfValue | undefined, counts: number[]) {
  const arr = await objs.resolve(v)
  if (!Array.isArray(arr) || !counts.includes(arr.length)) return undefined
  const out = await Promise.all(arr.map((n) => objs.resolve(n)))
  return out.every(finite) ? out : undefined
}

async function dictOf(objs: PdfObjects, v: PdfValue | undefined) {
  const d = await objs.resolve(v)
  return isDict(d) ? d : undefined
}

/** The font's /BaseFont, looked up in a /DR resource dictionary. */
async function baseFontIn(objs: PdfObjects, dr: PdfValue | undefined, resource: string) {
  const res = await dictOf(objs, dr)
  const fonts = res && (await dictOf(objs, dictGet(res, 'Font')))
  const font = fonts && (await dictOf(objs, dictGet(fonts, resource)))
  const base = font && (await objs.resolve(dictGet(font, 'BaseFont')))
  return isName(base) ? base.name : undefined
}

async function readFont(objs: PdfObjects, annot: PdfDict, daFont: string) {
  const root = await dictOf(objs, dictGet(objs.trailer, 'Root'))
  const acroForm = root && (await dictOf(objs, dictGet(root, 'AcroForm')))
  const sources = [dictGet(annot, 'DR'), acroForm && dictGet(acroForm, 'DR')]
  for (const dr of sources) {
    const base = await baseFontIn(objs, dr, daFont)
    if (base !== undefined) return fontFromBaseName(base)
  }
  return fontFromBaseName(daFont, true)
}

async function readHead(objs: PdfObjects, le: PdfValue | undefined) {
  let v = await objs.resolve(le)
  if (Array.isArray(v)) v = await objs.resolve(v[0])
  return isName(v) && PDF_NAME.test(v.name) ? v.name : undefined
}

/** `rect` is the annotation's [x1 y1 x2 y2], used to reject a fringe that leaves no box. */
export async function readFreeTextFields(
  objs: PdfObjects,
  ref: PdfRef,
  rect: readonly number[],
  daFont: string | undefined
): Promise<FreeTextFields> {
  const fields: FreeTextFields = {}
  try {
    const annot = await objs.get(ref)
    if (!isDict(annot)) return fields

    const cl = await numbers(objs, dictGet(annot, 'CL'), [4, 6])
    if (cl) {
      fields.callout = []
      for (let i = 0; i < cl.length; i += 2)
        fields.callout.push({ x: cl[i]!, y: cl[i + 1]! })
    }

    const rd = await numbers(objs, dictGet(annot, 'RD'), [4])
    if (rd && rect.length === 4 && rd.every((n) => n >= 0)) {
      const [left, top, right, bottom] = rd as [number, number, number, number]
      const width = Math.abs(rect[2]! - rect[0]!)
      const height = Math.abs(rect[3]! - rect[1]!)
      if (left + right < width && top + bottom < height)
        fields.fringe = { left, top, right, bottom }
    }

    const head = await readHead(objs, dictGet(annot, 'LE'))
    if (head !== undefined) fields.head = head

    if (daFont !== undefined) {
      const font = await readFont(objs, annot, daFont)
      if (font) fields.font = font
    }
  } catch {
    // Whatever was read before the failure stands.
  }
  return fields
}

export async function readTextIcon(
  objs: PdfObjects,
  ref: PdfRef
): Promise<string | undefined> {
  try {
    const annot = await objs.get(ref)
    if (!isDict(annot)) return undefined
    const name = await objs.resolve(dictGet(annot, 'Name'))
    return isName(name) && PDF_NAME.test(name.name) ? name.name : undefined
  } catch {
    return undefined
  }
}
