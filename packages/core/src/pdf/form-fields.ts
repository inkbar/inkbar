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
  /**
   * The page a widget's GoTo goes to, by widget id: from its `/A`, or its `/Dest` when it has no
   * `/A`. Named destinations are in only when the reader was given a resolver.
   */
  destPages: Map<string, number>
  /** Widgets whose own `/A` is a JavaScript action (not one that only has JavaScript in `/Next`). */
  scriptActions: Set<string>
  /**
   * The GoTo, URI, Named, ResetForm and SubmitForm actions in each widget `/A`'s `/Next` chain,
   * in order, by widget id.
   */
  next: Map<string, WidgetAction[]>
}

export interface ReadFormExtrasOptions {
  /** The page index a named destination points at, if any. */
  destinationPage?: (name: string) => Promise<number | undefined>
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
    scriptActions: new Set(),
    next: new Map(),
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

/** ResetForm `/Flags` bit 1: `/Fields` lists the fields to leave alone. */
const RESET_EXCLUDE = 1
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

/** A widget's GoTo destination: its `/A`'s when that is a GoTo, else `/Dest` when it has no `/A`. */
async function destinationOf(
  objs: PdfObjects,
  widget: PdfDict,
  action: PdfDict | undefined
) {
  if (!action) return objs.resolve(dictGet(widget, 'Dest'))
  const s = await objs.resolve(dictGet(action, 'S'))
  return isName(s, 'GoTo') ? objs.resolve(dictGet(action, 'D')) : undefined
}

/** A string object's bytes as a Latin-1 string: how PDF.js keys a name tree. */
function rawString(v: PdfValue | undefined): string | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || v.kind !== 'string')
    return undefined
  let out = ''
  for (const c of v.bytes) out += String.fromCharCode(c)
  return out
}

/**
 * The actions an action's `/Next` runs after it, in order (ISO 32000 §12.6.2): each entry,
 * then that entry's own `/Next`, depth first. A cycle (back to the `/A` itself, `ref`, too) or a
 * chain deeper than `MAX_DEPTH` stops.
 */
async function nextChain(
  objs: PdfObjects,
  action: PdfDict,
  ref: PdfValue | undefined
): Promise<PdfDict[]> {
  const out: PdfDict[] = []
  const seen = new Set<string>(isRef(ref) ? [refKey(ref.num, ref.gen)] : [])
  /** False for a ref already visited; marks it visited. */
  const fresh = (v: PdfValue | undefined) => {
    if (!isRef(v)) return true
    const key = refKey(v.num, v.gen)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
  const visit = async (v: PdfValue | undefined, depth: number) => {
    if (depth > MAX_DEPTH || v === undefined || !fresh(v)) return
    const next = await objs.resolve(v)
    for (const item of Array.isArray(next) ? next : [next]) {
      if (!fresh(item)) continue
      const d = await dictOf(objs, item)
      if (!d) continue
      out.push(d)
      await visit(dictGet(d, 'Next'), depth + 1)
    }
  }
  await visit(dictGet(action, 'Next'), 0)
  return out
}

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
 * the locks they set, DocMDP, page `/Tabs`, GoTo pages, which `/A`s are JavaScript, the
 * actions in each `/A`'s `/Next` chain, and per-widget on states,
 * stored and default state names, `/DA` fonts, captions and barcode marks. Never throws: what cannot be read is left out.
 */
export async function readFormExtras(
  objs: PdfObjects | undefined,
  widgetIds: readonly string[],
  options: ReadFormExtrasOptions = {}
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
        const pageOf = async (dest: PdfValue | undefined) => {
          const name = isName(dest) ? dest.name : rawString(dest)
          if (name !== undefined) return options.destinationPage?.(name)
          const target = (await arrayOf(objs, dest))[0]
          return isRef(target) ? pages.get(refKey(target.num, target.gen)) : undefined
        }
        const page = await pageOf(await destinationOf(objs, widget, action))
        if (page !== undefined) extras.destPages.set(id, page)
        if (!action) continue
        if (isName(s, 'JavaScript')) extras.scriptActions.add(id)
        const next: WidgetAction[] = []
        for (const a of await nextChain(objs, action, dictGet(widget, 'A'))) {
          const ns = await objs.resolve(dictGet(a, 'S'))
          if (isName(ns, 'GoTo')) {
            const p = await pageOf(await objs.resolve(dictGet(a, 'D')))
            if (p !== undefined) next.push({ kind: 'goto', page: p })
          } else if (isName(ns, 'URI')) {
            const url = textString(await objs.resolve(dictGet(a, 'URI')))
            if (url) next.push({ kind: 'uri', url })
          } else if (isName(ns, 'Named')) {
            const n = await objs.resolve(dictGet(a, 'N'))
            if (isName(n)) next.push({ kind: 'named', name: n.name })
          } else if (isName(ns, 'ResetForm')) {
            const flags = await objs.resolve(dictGet(a, 'Flags'))
            next.push({
              kind: 'reset',
              fields: await fieldNames(objs, dictGet(a, 'Fields'), names),
              include: typeof flags !== 'number' || (flags & RESET_EXCLUDE) === 0,
            })
          } else if (isName(ns, 'SubmitForm')) {
            const submit = await readSubmit(objs, a, names)
            if (submit) next.push(submit)
          }
          // JavaScript in the chain runs with the widget's Action scripts; other kinds are
          // not supported.
        }
        if (next.length > 0) extras.next.set(id, next)
      } catch {
        // One unreadable widget does not stop the others.
      }
    }
  } catch {
    // Whatever was read before the failure stands.
  }
  return extras
}
