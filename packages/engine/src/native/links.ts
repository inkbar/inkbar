import { EngineError } from '../errors.ts'

import { withBytes } from './strings.ts'

import type {
  DestinationArgKind,
  DestinationFitKind,
  DestinationPageKind,
  ExplicitDestination,
  FileAction,
  FileDestination,
  FileTarget,
  Outline,
  OutlineEntry,
  PageAnnotationEntry,
  PageLinkFacts,
  PageLinks,
} from '../types.ts'
import type { Heap } from './strings.ts'

type Json = Record<string, unknown>

function fail(what: string, cause?: unknown): EngineError {
  return new EngineError('engine-failure', `${what} could not be read.`, {
    cause: cause ?? new Error('unexpected shape'),
  })
}

/** A failure whose cause names the key at fault and what it should have held. */
function bad(what: string, key: string, expected: string): EngineError {
  return fail(what, new Error(`${key}: expected ${expected}`))
}

function parse(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw fail(what, cause)
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown, what: string, key: string): Json {
  if (!isObject(value)) throw bad(what, key, 'an object')
  return value
}

function array(value: unknown, what: string, key: string): unknown[] {
  if (!Array.isArray(value)) throw bad(what, key, 'a list')
  return value
}

function number(value: unknown, what: string, key: string): number {
  if (typeof value !== 'number') throw bad(what, key, 'a number')
  return value
}

function string(value: unknown, what: string, key: string): string {
  if (typeof value !== 'string') throw bad(what, key, 'a string')
  return value
}

function hexBytes(value: unknown, what: string, key: string): Uint8Array {
  const text = string(value, what, key)
  if (text.length % 2 !== 0 || /[^0-9a-f]/i.test(text))
    throw bad(what, key, 'hex digits in pairs')
  const bytes = new Uint8Array(text.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const present = (value: unknown): boolean => value !== null && value !== undefined

function boolean(value: unknown, what: string, key: string): boolean {
  if (typeof value !== 'boolean') throw bad(what, key, 'a boolean')
  return value
}

/** A whole number from 0. */
function count(value: unknown, what: string, key: string): number {
  const n = number(value, what, key)
  if (!Number.isInteger(n) || n < 0) throw bad(what, key, 'a whole number from 0')
  return n
}

/** One of `values`; any other string, or anything else, is malformed. */
function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  what: string,
  key: string
): T {
  if (!(values as readonly unknown[]).includes(value))
    throw bad(what, key, `one of ${values.join(', ')}`)
  return value as T
}

/**
 * A key the module writes on every action of its kind, as one of `values` or `null`. Absent, it
 * comes from a module that does not write it, and is malformed.
 */
function kindOrNull<T extends string>(
  item: Json,
  key: string,
  values: readonly T[],
  what: string
): T | undefined {
  if (!(key in item)) throw bad(what, key, `one of ${values.join(', ')} or null`)
  const value = item[key]
  return value === null ? undefined : oneOf(values, value, what, key)
}

/** A key the fork writes only as `true`: absent, `null` or `true`. */
function onlyTrue(value: unknown, what: string, key: string): boolean {
  if (!present(value)) return false
  if (value !== true) throw bad(what, key, 'true, null or no key')
  return true
}

const ARG_KINDS: readonly DestinationArgKind[] = ['number', 'null', 'other']
const FIT_KINDS: readonly DestinationFitKind[] = ['name', 'string', 'other', 'missing']
const PAGE_KINDS: readonly DestinationPageKind[] = ['ref', 'integer', 'other', 'missing']
const URI_KINDS = ['string', 'name'] as const
const FILE_KINDS = ['string', 'spec'] as const
/** The fork reports the kinds of at most this many arguments. */
const MAX_ARG_KINDS = 8

function destination(value: unknown, what: string): FileDestination {
  const item = object(value, what, 'dest')
  if (present(item.nameHex)) return { name: hexBytes(item.nameHex, what, 'nameHex') }
  const args = array(item.args, what, 'args').map((arg) =>
    arg === null ? null : number(arg, what, 'args')
  )
  const argCount = count(item.argCount, what, 'argCount')
  const argKinds = array(item.argKinds, what, 'argKinds').map((kind) =>
    oneOf(ARG_KINDS, kind, what, 'argKinds')
  )
  if (argKinds.length !== Math.min(argCount, MAX_ARG_KINDS))
    throw bad(what, 'argKinds', `${Math.min(argCount, MAX_ARG_KINDS)} entries`)
  const result: ExplicitDestination = {
    page: number(item.page, what, 'page'),
    fit: string(item.fit, what, 'fit'),
    args,
    argCount,
    argKinds,
    argIndirect: boolean(item.argIndirect, what, 'argIndirect'),
    fitKind: oneOf(FIT_KINDS, item.fitKind, what, 'fitKind'),
    pageKind: oneOf(PAGE_KINDS, item.pageKind, what, 'pageKind'),
  }
  if (present(item.pageRef)) {
    const [objectNumber, generation, ...rest] = array(item.pageRef, what, 'pageRef').map(
      (n) => count(n, what, 'pageRef')
    )
    if (objectNumber === undefined || generation === undefined || rest.length > 0)
      throw bad(what, 'pageRef', 'two numbers')
    result.pageRef = { objectNumber, generation }
  } else if (item.pageRef !== null) throw bad(what, 'pageRef', 'a list or null')
  return result
}

function action(value: unknown, what: string): FileAction {
  const item = object(value, what, 'action')
  const result: FileAction = { kind: string(item.s, what, 's') }
  if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what, 'uriHex')
  if (result.kind === 'URI') {
    const uriKind = kindOrNull(item, 'uriKind', URI_KINDS, what)
    if (uriKind) result.uriKind = uriKind
  } else if (present(item.uriKind))
    result.uriKind = oneOf(URI_KINDS, item.uriKind, what, 'uriKind')
  if (present(item.dest)) result.destination = destination(item.dest, what)
  if (present(item.fileHex)) result.file = hexBytes(item.fileHex, what, 'fileHex')
  if (result.kind === 'GoToR' || result.kind === 'Launch') {
    const fileKind = kindOrNull(item, 'fileKind', FILE_KINDS, what)
    if (fileKind) result.fileKind = fileKind
  } else if (present(item.fileKind))
    result.fileKind = oneOf(FILE_KINDS, item.fileKind, what, 'fileKind')
  if (present(item.newWindow))
    result.newWindow = boolean(item.newWindow, what, 'newWindow')
  if (present(item.name)) result.name = string(item.name, what, 'name')
  if (present(item.js)) result.script = string(item.js, what, 'js')
  if (onlyTrue(item.scriptTruncated, what, 'scriptTruncated'))
    result.scriptTruncated = true
  return result
}

function target(item: Json, what: string): FileTarget {
  const result: FileTarget = {}
  if (present(item.dest)) result.destination = destination(item.dest, what)
  if (present(item.action)) result.action = action(item.action, what)
  if (present(item.aa)) result.additionalAction = action(item.aa, what)
  return result
}

/** The JSON `INK_Links_Page` returns, as a page's annotations and links. */
export function parsePageLinks(text: string): PageLinks {
  const what = "A page's links"
  const root = object(parse(text, what), what, 'root')
  const annotations = array(root.annots, what, 'annots').map(
    (raw): PageAnnotationEntry => {
      const item = object(raw, what, 'annots')
      const entry: PageAnnotationEntry = {
        index: number(item.index, what, 'index'),
        subtype: string(item.subtype, what, 'subtype'),
        flags: number(item.flags, what, 'flags'),
        rectOk: boolean(item.rectOk, what, 'rectOk'),
        hasQuads: boolean(item.hasQuads, what, 'hasQuads'),
        quadsOk: boolean(item.quadsOk, what, 'quadsOk'),
      }
      const objectNumber = number(item.obj, what, 'obj')
      const generation = count(item.generation, what, 'generation')
      if (objectNumber !== 0) {
        entry.objectNumber = objectNumber
        entry.generation = generation
      } else if (generation !== 0) throw bad(what, 'generation', '0 for a direct object')
      return entry
    }
  )
  const links = array(root.links, what, 'links').map((raw): PageLinkFacts => {
    const item = object(raw, what, 'links')
    const [left, bottom, right, top] = array(item.rect, what, 'rect').map((n) =>
      number(n, what, 'rect')
    )
    if (
      left === undefined ||
      bottom === undefined ||
      right === undefined ||
      top === undefined
    )
      throw bad(what, 'rect', 'four numbers')
    const link: PageLinkFacts = {
      index: number(item.index, what, 'index'),
      rect: { x: left, y: bottom, width: right - left, height: top - bottom },
      ...target(item, what),
    }
    if (present(item.quads))
      link.quads = array(item.quads, what, 'quads').map((n) => number(n, what, 'quads'))
    if (onlyTrue(item.destInvalid, what, 'destInvalid')) {
      if (link.destination) throw bad(what, 'destInvalid', 'no destination beside it')
      link.destinationInvalid = true
    }
    return link
  })
  return { annotations, links }
}

/** The JSON `INK_Outline` returns, nested by each item's depth. */
export function parseOutline(text: string): Outline {
  const what = 'The outline'
  const root = object(parse(text, what), what, 'root')
  const truncated = boolean(root.truncated, what, 'truncated')
  const items: OutlineEntry[] = []
  // The open ancestors of the next item. A depth that skips levels attaches to the nearest
  // ancestor there is.
  const stack: { depth: number; entry: OutlineEntry }[] = []
  for (const raw of array(root.items, what, 'items')) {
    const item = object(raw, what, 'items')
    const depth = count(item.depth, what, 'depth')
    const flags = number(item.flags, what, 'flags')
    const entry: OutlineEntry = {
      title: string(item.title, what, 'title'),
      bold: (flags & 2) !== 0,
      italic: (flags & 1) !== 0,
      count: number(item.count, what, 'count'),
      children: [],
      ...target(item, what),
    }
    while (
      stack.length > 0 &&
      (stack[stack.length - 1] as { depth: number }).depth >= depth
    )
      stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.entry.children.push(entry)
    else items.push(entry)
    stack.push({ depth, entry })
  }
  return { items, truncated }
}

/** The JSON `INK_Dest_Named` returns: a destination, or `null` for a name the file lacks. */
export function parseNamedDestination(text: string): FileDestination | undefined {
  const what = 'A named destination'
  const root = parse(text, what)
  return root === null ? undefined : destination(root, what)
}

/** Reads the call's JSON, then frees it. NULL means the call could not read. */
function takeJson(heap: Heap, pointer: number, what: string): string {
  if (pointer === 0)
    throw new EngineError('engine-failure', `${what} could not be read.`, {
      pdfiumError: heap.fn.FPDF_GetLastError(),
    })
  try {
    const bytes = heap.native.HEAPU8
    const end = bytes.indexOf(0, pointer)
    if (end < 0) throw fail(what)
    return new TextDecoder().decode(bytes.subarray(pointer, end))
  } finally {
    if (!heap.stopped) heap.fn.INK_Json_Free(pointer)
  }
}

export function readPageLinks(heap: Heap, doc: number, index: number): PageLinks {
  return parsePageLinks(
    takeJson(heap, heap.fn.INK_Links_Page(doc, index), "A page's links")
  )
}

export function readOutline(heap: Heap, doc: number): Outline {
  return parseOutline(takeJson(heap, heap.fn.INK_Outline(doc), 'The outline'))
}

export function readNamedDestination(
  heap: Heap,
  doc: number,
  name: Uint8Array
): FileDestination | undefined {
  return parseNamedDestination(
    withBytes(heap, name, (pointer, length) =>
      takeJson(heap, heap.fn.INK_Dest_Named(doc, pointer, length), 'A named destination')
    )
  )
}
