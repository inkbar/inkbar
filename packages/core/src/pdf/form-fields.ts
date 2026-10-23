import { readFont, refOfPdfjsId, type FontFields } from './annotation-fields'
import {
  dictGet,
  isDict,
  isName,
  isRef,
  textString,
  type PdfDict,
  type PdfValue,
} from './lexer'

import type { PdfObjects } from './objects'
import type { WidgetAction } from '../model/form/types'

/** What a widget's dictionary holds that PDF.js does not report. */
export interface WidgetExtras {
  /** A checkbox or radio widget's on state: the first `/AP /N` key that is not `Off`. */
  onState?: string
  /** A checkbox or radio widget's `/AP /N` has an `Off` appearance. */
  offAppearance?: true
  /** A checkbox or radio field's `/V` state name, which PDF.js reports as an export value. */
  state?: string
  /** A checkbox or radio field's `/DV` state name. */
  defaultState?: string
  /** The `/DA` font, resolved through `/DR` to its `/BaseFont`. */
  font?: FontFields
  /** `/MK /CA`. */
  caption?: string
  /** The field has `/PMD`, which marks a barcode field. */
  barcode?: true
  /** `/TU` from the widget or its terminal field; PDF.js reads only the widget's. */
  tooltip?: string
}

/** Form details read from the file's own objects. */
export interface FormExtras {
  /** SubmitForm actions, by widget id. */
  submits: Map<string, WidgetAction>
  /** Names of fields holding a certificate signature. */
  signed: Set<string>
  /** Fields a signature's `/Lock` or FieldMDP transform makes read-only. */
  lockedFields: Set<string>
  /** DocMDP with P 1: no changes at all. */
  lockAll: boolean
  /** Page `/Tabs`, by page index, for pages that set one. */
  tabs: Map<number, 'R' | 'C' | 'S' | 'W'>
  /** What each widget's own dictionary adds, by PDF.js widget id (`12R`). */
  widgets: Map<string, WidgetExtras>
  /** Page index of a GoTo action's explicit destination, by widget id. */
  destPages: Map<string, number>
}

export function emptyFormExtras(): FormExtras {
  return {
    submits: new Map(),
    signed: new Set(),
    lockedFields: new Set(),
    lockAll: false,
    tabs: new Map(),
    widgets: new Map(),
    destPages: new Map(),
  }
}

/** Deep enough for any real form; it also stops a /Parent or /Kids cycle. */
const MAX_DEPTH = 32

const TABS = new Set(['R', 'C', 'S', 'W'])

const refKey = (num: number, gen: number) => (gen === 0 ? `${num}R` : `${num}R${gen}`)

async function dictOf(objs: PdfObjects, v: PdfValue | undefined) {
  const d = await objs.resolve(v)
  return isDict(d) ? d : undefined
}

async function arrayOf(objs: PdfObjects, v: PdfValue | undefined) {
  const a = await objs.resolve(v)
  return Array.isArray(a) ? a : []
}

/** `key` on `dict` or the nearest `/Parent` that has it. */
async function inherited(objs: PdfObjects, dict: PdfDict, key: string) {
  let node: PdfDict | undefined = dict
  for (let depth = 0; node && depth < MAX_DEPTH; depth++) {
    const v = dictGet(node, key)
    if (v !== undefined) return objs.resolve(v)
    node = await dictOf(objs, dictGet(node, 'Parent'))
  }
  return undefined
}

/**
 * `key` on the widget, else on its terminal field: the widget itself when it carries `/T`,
 * otherwise its `/Parent`. For keys that are not inherited, such as `/TU`.
 */
async function terminal(objs: PdfObjects, widget: PdfDict, key: string) {
  const own = dictGet(widget, key)
  if (own !== undefined) return objs.resolve(own)
  if (dictGet(widget, 'T') !== undefined) return undefined
  const parent = await dictOf(objs, dictGet(widget, 'Parent'))
  const v = parent && dictGet(parent, key)
  return v === undefined ? undefined : objs.resolve(v)
}

interface FieldNode {
  name: string
  dict: PdfDict
}

/** Terminal fields under `/AcroForm /Fields`, plus the full name of every field object by ref. */
async function walkFields(objs: PdfObjects, acroForm: PdfDict | undefined) {
  const terminals: FieldNode[] = []
  const names = new Map<string, string>()
  const seen = new Set<string>()
  const visit = async (v: PdfValue, prefix: string, depth: number) => {
    if (depth > MAX_DEPTH) return
    if (isRef(v)) {
      const key = refKey(v.num, v.gen)
      if (seen.has(key)) return
      seen.add(key)
    }
    const dict = await dictOf(objs, v)
    if (!dict) return
    const part = textString(await objs.resolve(dictGet(dict, 'T')))
    const name = part === undefined ? prefix : prefix ? `${prefix}.${part}` : part
    if (isRef(v)) names.set(refKey(v.num, v.gen), name)
    const kids = await arrayOf(objs, dictGet(dict, 'Kids'))
    const fieldKids: PdfValue[] = []
    for (const kid of kids) {
      const kd = await dictOf(objs, kid)
      if (kd && dictGet(kd, 'T') !== undefined) fieldKids.push(kid)
    }
    if (fieldKids.length === 0) {
      if (name) terminals.push({ name, dict })
      return
    }
    for (const kid of fieldKids) await visit(kid, name, depth + 1)
  }
  if (acroForm)
    for (const f of await arrayOf(objs, dictGet(acroForm, 'Fields')))
      await visit(f, '', 0)
  return { terminals, names }
}

/** Names from a `/Fields` array of strings or field references. */
async function fieldNames(
  objs: PdfObjects,
  v: PdfValue | undefined,
  names: Map<string, string>
): Promise<string[]> {
  const out: string[] = []
  for (const item of await arrayOf(objs, v)) {
    const name = isRef(item)
      ? names.get(refKey(item.num, item.gen))
      : textString(await objs.resolve(item))
    if (name !== undefined) out.push(name)
  }
  return out
}

const covers = (lock: string, name: string) =>
  name === lock || name.startsWith(`${lock}.`)

/** Fields a `/Lock` or FieldMDP `/TransformParams` dictionary makes read-only. */
async function lockedBy(
  objs: PdfObjects,
  lock: PdfDict,
  all: readonly string[],
  names: Map<string, string>
): Promise<string[]> {
  const action = await objs.resolve(dictGet(lock, 'Action'))
  if (isName(action, 'All')) return [...all]
  const listed = await fieldNames(objs, dictGet(lock, 'Fields'), names)
  const hit = (n: string) => listed.some((l) => covers(l, n))
  if (isName(action, 'Include')) return all.filter(hit)
  if (isName(action, 'Exclude')) return all.filter((n) => !hit(n))
  return []
}

/** The `/TransformParams` of each signature reference using `method`. */
async function transforms(objs: PdfObjects, sig: PdfDict, method: string) {
  const out: PdfDict[] = []
  for (const r of await arrayOf(objs, dictGet(sig, 'Reference'))) {
    const ref = await dictOf(objs, r)
    if (!ref || !isName(await objs.resolve(dictGet(ref, 'TransformMethod')), method))
      continue
    const params = await dictOf(objs, dictGet(ref, 'TransformParams'))
    if (params) out.push(params)
  }
  return out
}

async function readDocMdp(objs: PdfObjects, root: PdfDict): Promise<boolean> {
  const perms = await dictOf(objs, dictGet(root, 'Perms'))
  const sig = perms && (await dictOf(objs, dictGet(perms, 'DocMDP')))
  if (!sig) return false
  for (const params of await transforms(objs, sig, 'DocMDP')) {
    if ((await objs.resolve(dictGet(params, 'P'))) === 1) return true
  }
  return false
}

/** Page refs in page order, and each page's `/Tabs`. */
async function walkPages(objs: PdfObjects, root: PdfDict) {
  const pages = new Map<string, number>()
  const tabs = new Map<number, 'R' | 'C' | 'S' | 'W'>()
  const seen = new Set<string>()
  const visit = async (v: PdfValue | undefined, depth: number) => {
    if (depth > MAX_DEPTH) return
    if (isRef(v)) {
      const key = refKey(v.num, v.gen)
      if (seen.has(key)) return
      seen.add(key)
    }
    const node = await dictOf(objs, v)
    if (!node) return
    const kids = dictGet(node, 'Kids')
    if (kids !== undefined && !isName(dictGet(node, 'Type'), 'Page')) {
      for (const kid of await arrayOf(objs, kids)) await visit(kid, depth + 1)
      return
    }
    const index = pages.size
    pages.set(isRef(v) ? refKey(v.num, v.gen) : `#${index}`, index)
    const t = await objs.resolve(dictGet(node, 'Tabs'))
    if (isName(t) && TABS.has(t.name)) tabs.set(index, t.name as 'R' | 'C' | 'S' | 'W')
  }
  await visit(dictGet(root, 'Pages'), 0)
  return { pages, tabs }
}

/** A submit URL: a string, or a file specification's `/UF` or `/F`. */
async function fileSpecUrl(objs: PdfObjects, v: PdfValue | undefined) {
  const f = await objs.resolve(v)
  const direct = textString(f)
  if (direct !== undefined) return direct
  if (!isDict(f)) return undefined
  return (
    textString(await objs.resolve(dictGet(f, 'UF'))) ??
    textString(await objs.resolve(dictGet(f, 'F')))
  )
}

const SUBMIT_EXCLUDE = 1
const SUBMIT_HTML = 4
const SUBMIT_GET = 8
const SUBMIT_XFDF = 32
const SUBMIT_PDF = 256

async function readSubmit(
  objs: PdfObjects,
  action: PdfDict,
  names: Map<string, string>
): Promise<WidgetAction | undefined> {
  const url = await fileSpecUrl(objs, dictGet(action, 'F'))
  if (url === undefined) return undefined
  const raw = await objs.resolve(dictGet(action, 'Flags'))
  const flags = typeof raw === 'number' ? raw : 0
  const fields = await fieldNames(objs, dictGet(action, 'Fields'), names)
  const include = (flags & SUBMIT_EXCLUDE) === 0
  if (flags & SUBMIT_XFDF) return { kind: 'submit', url, fields, include, format: 'xfdf' }
  if (flags & SUBMIT_PDF) return { kind: 'submit', url, fields, include, format: 'pdf' }
  if (flags & SUBMIT_HTML) {
    const method = flags & SUBMIT_GET ? 'GET' : 'POST'
    return { kind: 'submit', url, fields, include, format: 'html', method }
  }
  return { kind: 'submit', url, fields, include, format: 'fdf' }
}

const FF_PUSHBUTTON = 1 << 16

async function readWidget(
  objs: PdfObjects,
  widget: PdfDict,
  acroFormDa: string | undefined
): Promise<WidgetExtras> {
  const extras: WidgetExtras = {}
  const ft = await inherited(objs, widget, 'FT')
  const ff = await inherited(objs, widget, 'Ff')
  if (isName(ft, 'Btn') && !(typeof ff === 'number' && ff & FF_PUSHBUTTON)) {
    const ap = await dictOf(objs, dictGet(widget, 'AP'))
    const n = ap && (await dictOf(objs, dictGet(ap, 'N')))
    const on = n && [...n.entries.keys()].find((k) => k !== 'Off')
    if (on !== undefined) extras.onState = on
    if (n?.entries.has('Off')) extras.offAppearance = true
    const v = await inherited(objs, widget, 'V')
    if (isName(v)) extras.state = v.name
    const dv = await inherited(objs, widget, 'DV')
    if (isName(dv)) extras.defaultState = dv.name
  }
  const da = textString(await inherited(objs, widget, 'DA')) ?? acroFormDa
  const daFont = da && /\/([^\s/]+)\s+[-+\d.]+\s+Tf/.exec(da)?.[1]
  const font = daFont ? await readFont(objs, widget, daFont) : undefined
  if (font) extras.font = font
  const mk = await dictOf(objs, dictGet(widget, 'MK'))
  const caption = mk && textString(await objs.resolve(dictGet(mk, 'CA')))
  if (caption) extras.caption = caption
  if ((await inherited(objs, widget, 'PMD')) !== undefined) extras.barcode = true
  const tooltip = textString(await terminal(objs, widget, 'TU'))
  if (tooltip) extras.tooltip = tooltip
  return extras
}

/**
 * Reads what PDF.js leaves out of widget data: SubmitForm actions, certificate signatures and
 * the locks they set, DocMDP, page `/Tabs`, explicit GoTo pages, and per-widget on states,
 * stored and default state names, `/DA` fonts, captions and barcode marks. Never throws: what cannot be read is left out.
 */
export async function readFormExtras(
  objs: PdfObjects | undefined,
  widgetIds: readonly string[]
): Promise<FormExtras> {
  const extras = emptyFormExtras()
  if (!objs) return extras
  try {
    const root = await dictOf(objs, dictGet(objs.trailer, 'Root'))
    if (!root) return extras
    const acroForm = await dictOf(objs, dictGet(root, 'AcroForm'))
    const { terminals, names } = await walkFields(objs, acroForm)
    const all = terminals.map((t) => t.name)
    const acroFormDa = acroForm && textString(await objs.resolve(dictGet(acroForm, 'DA')))

    for (const { name, dict } of terminals) {
      try {
        if (!isName(await inherited(objs, dict, 'FT'), 'Sig')) continue
        const sig = await dictOf(objs, dictGet(dict, 'V'))
        if (!sig) continue
        extras.signed.add(name)
        const locks = await transforms(objs, sig, 'FieldMDP')
        const lock = await dictOf(objs, dictGet(dict, 'Lock'))
        if (lock) locks.push(lock)
        for (const l of locks)
          for (const n of await lockedBy(objs, l, all, names)) extras.lockedFields.add(n)
      } catch {
        // One unreadable signature does not stop the others.
      }
    }

    extras.lockAll = await readDocMdp(objs, root).catch(() => false)
    const { pages, tabs } = await walkPages(objs, root)
    extras.tabs = tabs

    for (const id of widgetIds) {
      try {
        const ref = refOfPdfjsId(id)
        const widget = ref && (await dictOf(objs, ref))
        if (!widget) continue
        extras.widgets.set(id, await readWidget(objs, widget, acroFormDa))
        const action = await dictOf(objs, dictGet(widget, 'A'))
        const s = action && (await objs.resolve(dictGet(action, 'S')))
        if (action && isName(s, 'SubmitForm')) {
          const submit = await readSubmit(objs, action, names)
          if (submit) extras.submits.set(id, submit)
        }
        const dest =
          action && isName(s, 'GoTo') ? dictGet(action, 'D') : dictGet(widget, 'Dest')
        const target = (await arrayOf(objs, dest))[0]
        const page = isRef(target) ? pages.get(refKey(target.num, target.gen)) : undefined
        if (page !== undefined) extras.destPages.set(id, page)
      } catch {
        // One unreadable widget does not stop the others.
      }
    }
  } catch {
    // Whatever was read before the failure stands.
  }
  return extras
}
