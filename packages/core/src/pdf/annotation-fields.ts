import { PDF_NAME } from '../model/annotations/pdf-names'

import {
  dictGet,
  isDict,
  isName,
  isRef,
  textString,
  type PdfDict,
  type PdfRef,
  type PdfValue,
} from './lexer'
import { walkPages } from './pages'

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

/** The id PDF.js gives the object `ref` names: `12R`, or `12R3` at generation 3. */
export function pdfjsIdOfRef(ref: PdfRef): string {
  return ref.gen === 0 ? `${ref.num}R` : `${ref.num}R${ref.gen}`
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

/**
 * The font a `/DA` font name selects: its `/BaseFont` in the annotation's `/DR`, then the
 * AcroForm's `/DR`, else the name itself when it is a standard family.
 */
export async function readFont(
  objs: PdfObjects,
  annot: PdfDict,
  daFont: string
): Promise<FontFields | undefined> {
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

/** The private entry under which Inkbar stores an annotation it wrote: a stream of JSON. */
const INKBAR_DATA = 'INKB_Gloss'

/**
 * The most data read from one `/INKB_Gloss` entry: 8 MB. An annotation Inkbar wrote stores far
 * less, pictures included, and a file made to inflate past it is not read further.
 */
export const INKBAR_DATA_MAX_BYTES = 8 * 1024 * 1024

/**
 * The text Inkbar stored with the annotation `ref` names: its `/INKB_Gloss` stream, decoded
 * as UTF-8. Undefined when the annotation has no such entry, the entry is not a stream, the
 * data cannot be decoded, or it is larger than `INKBAR_DATA_MAX_BYTES`. Never throws.
 */
export async function readInkbarData(
  objs: PdfObjects,
  ref: PdfRef
): Promise<string | undefined> {
  try {
    const annot = await objs.get(ref)
    if (!isDict(annot)) return undefined
    const entry = dictGet(annot, INKBAR_DATA)
    if (!isRef(entry)) return undefined
    const bytes = await objs.stream(entry, INKBAR_DATA_MAX_BYTES)
    return bytes && new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** An annotation that carries Inkbar's data, as the file has it now. */
export interface SavedAnnotationPlace {
  /** Zero-based page index. */
  page: number
  ref: PdfRef
  /** `/Rect` as left, bottom, right, top; undefined when it is not four numbers. */
  rect: [number, number, number, number] | undefined
  /** `/M` as written, a PDF date string; undefined when there is none. */
  modified: string | undefined
  /** Whether it has a `/Popup` entry. Inkbar writes none, so another program added it. */
  popup: boolean
}

/** One annotation's `/IRT`: `from` replies to `to`. Both are references into the file. */
export interface ReplyLink {
  from: PdfRef
  to: PdfRef
}

/** A Redact annotation with no Inkbar data: another program's unapplied mark. */
export interface ForeignMarkPlace {
  /** Zero-based page index. */
  page: number
  ref: PdfRef
  /**
   * `/QuadPoints` in groups of eight numbers, as stored; undefined when absent, empty, not a
   * multiple of eight, or not all finite.
   */
  quadPoints: number[][] | undefined
  /** `/IC` as its 1, 3 or 4 numbers; undefined otherwise. */
  fill: number[] | undefined
  /** The `/Popup` reference, when it has one. */
  popup: PdfRef | undefined
  /**
   * Whether that pop-up can go with the mark: a reference in the same page's `/Annots` to a
   * dictionary with `/Subtype /Popup` whose `/Parent` is a reference to this mark. False when
   * there is no pop-up, or when it is anything else, such as another annotation or a pop-up
   * that belongs to another.
   */
  popupListed: boolean
}

/** What a file's pages hold that lifting reads. */
export interface SavedAnnotations {
  /** The annotations that carry Inkbar's data, in page order and then `/Annots` order. */
  places: SavedAnnotationPlace[]
  /** Every `/IRT` among the pages' annotations, whoever wrote the reply. */
  replies: ReplyLink[]
  /** In page order and then `/Annots` order. */
  marks: ForeignMarkPlace[]
}

/**
 * `/QuadPoints` as groups of eight numbers; undefined unless the array is a non-empty multiple
 * of eight, all finite.
 */
async function readQuadPoints(objs: PdfObjects, v: PdfValue | undefined) {
  const arr = await objs.resolve(v)
  if (!Array.isArray(arr) || arr.length === 0 || arr.length % 8 !== 0) return undefined
  const all = await numbers(objs, arr, [arr.length])
  if (!all) return undefined
  const groups: number[][] = []
  for (let i = 0; i < all.length; i += 8) groups.push(all.slice(i, i + 8))
  return groups
}

/**
 * Every annotation in a page's `/Annots` that has an `/INKB_Gloss` entry, in page order and then
 * `/Annots` order, with its `/Rect`, its `/M` and whether it has a `/Popup`; every `/IRT`
 * among the pages' annotations; and every Redact annotation without that entry, as a mark. An
 * annotation written inline in `/Annots` has no id to hide it by and is left out. Never throws:
 * what cannot be read is left out.
 */
export async function readSavedAnnotations(objs: PdfObjects): Promise<SavedAnnotations> {
  const out: SavedAnnotationPlace[] = []
  const replies: ReplyLink[] = []
  const marks: ForeignMarkPlace[] = []
  try {
    const root = await dictOf(objs, dictGet(objs.trailer, 'Root'))
    if (!root) return { places: out, replies, marks }
    const { dicts } = await walkPages(objs, root)
    for (const [page, dict] of dicts.entries()) {
      const annots = await objs.resolve(dictGet(dict, 'Annots'))
      if (!Array.isArray(annots)) continue
      const same = (a: PdfValue | undefined, r: PdfRef) =>
        isRef(a) && a.num === r.num && a.gen === r.gen
      /** Whether `popup` is listed here and is the pop-up of the annotation `parent`. */
      const popupOf = async (popup: PdfRef, parent: PdfRef) => {
        if (!annots.some((a) => same(a, popup))) return false
        const dict = await objs.get(popup)
        if (!isDict(dict)) return false
        const subtype = await objs.resolve(dictGet(dict, 'Subtype'))
        return (
          isName(subtype) &&
          subtype.name === 'Popup' &&
          same(dictGet(dict, 'Parent'), parent)
        )
      }
      for (const ref of annots) {
        if (!isRef(ref)) continue
        const annot = await objs.get(ref)
        if (!isDict(annot)) continue
        const irt = dictGet(annot, 'IRT')
        if (isRef(irt)) replies.push({ from: ref, to: irt })
        if (dictGet(annot, INKBAR_DATA) === undefined) {
          const subtype = await objs.resolve(dictGet(annot, 'Subtype'))
          if (isName(subtype) && subtype.name === 'Redact') {
            const popup = dictGet(annot, 'Popup')
            const fill = await numbers(objs, dictGet(annot, 'IC'), [1, 3, 4])
            marks.push({
              page,
              ref,
              quadPoints: await readQuadPoints(objs, dictGet(annot, 'QuadPoints')),
              fill,
              popup: isRef(popup) ? popup : undefined,
              popupListed: isRef(popup) && (await popupOf(popup, ref)),
            })
          }
          continue
        }
        const r = await numbers(objs, dictGet(annot, 'Rect'), [4])
        const modified = textString(await objs.resolve(dictGet(annot, 'M')))
        out.push({
          page,
          ref,
          rect: r && [
            Math.min(r[0]!, r[2]!),
            Math.min(r[1]!, r[3]!),
            Math.max(r[0]!, r[2]!),
            Math.max(r[1]!, r[3]!),
          ],
          modified,
          popup: dictGet(annot, 'Popup') !== undefined,
        })
      }
    }
  } catch {
    // What was read before the failure stands.
  }
  return { places: out, replies, marks }
}

/** The `places` of `readSavedAnnotations`. */
export async function readSavedAnnotationPlaces(
  objs: PdfObjects
): Promise<SavedAnnotationPlace[]> {
  return (await readSavedAnnotations(objs)).places
}
