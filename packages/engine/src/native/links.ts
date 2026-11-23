import { EngineError } from '../errors.ts'

import { withBytes } from './strings.ts'

import type {
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

function object(value: unknown, what: string): Json {
  if (!isObject(value)) throw fail(what)
  return value
}

function array(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw fail(what)
  return value
}

function number(value: unknown, what: string): number {
  if (typeof value !== 'number') throw fail(what)
  return value
}

function string(value: unknown, what: string): string {
  if (typeof value !== 'string') throw fail(what)
  return value
}

function hexBytes(value: unknown, what: string): Uint8Array {
  const text = string(value, what)
  if (text.length % 2 !== 0 || /[^0-9a-f]/i.test(text)) throw fail(what)
  const bytes = new Uint8Array(text.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const present = (value: unknown): boolean => value !== null && value !== undefined

function destination(value: unknown, what: string): FileDestination {
  const item = object(value, what)
  if (present(item.nameHex)) return { name: hexBytes(item.nameHex, what) }
  const args = array(item.args, what).map((arg) =>
    arg === null ? null : number(arg, what)
  )
  return { page: number(item.page, what), fit: string(item.fit, what), args }
}

function action(value: unknown, what: string): FileAction {
  const item = object(value, what)
  const result: FileAction = { kind: string(item.s, what) }
  if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what)
  if (present(item.dest)) result.destination = destination(item.dest, what)
  if (present(item.fileHex)) result.file = hexBytes(item.fileHex, what)
  if (present(item.newWindow)) {
    if (typeof item.newWindow !== 'boolean') throw fail(what)
    result.newWindow = item.newWindow
  }
  if (present(item.name)) result.name = string(item.name, what)
  if (present(item.js)) result.script = string(item.js, what)
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
  const root = object(parse(text, what), what)
  const annotations = array(root.annots, what).map((raw): PageAnnotationEntry => {
    const item = object(raw, what)
    if (typeof item.rectOk !== 'boolean' || typeof item.quadsOk !== 'boolean')
      throw fail(what)
    const entry: PageAnnotationEntry = {
      index: number(item.index, what),
      subtype: string(item.subtype, what),
      flags: number(item.flags, what),
      rectOk: item.rectOk,
      quadsOk: item.quadsOk,
    }
    const objectNumber = number(item.obj, what)
    if (objectNumber !== 0) entry.objectNumber = objectNumber
    return entry
  })
  const links = array(root.links, what).map((raw): PageLinkFacts => {
    const item = object(raw, what)
    const [left, bottom, right, top] = array(item.rect, what).map((n) => number(n, what))
    if (
      left === undefined ||
      bottom === undefined ||
      right === undefined ||
      top === undefined
    )
      throw fail(what)
    const link: PageLinkFacts = {
      index: number(item.index, what),
      rect: { x: left, y: bottom, width: right - left, height: top - bottom },
      ...target(item, what),
    }
    if (present(item.quads))
      link.quads = array(item.quads, what).map((n) => number(n, what))
    return link
  })
  return { annotations, links }
}

/** The JSON `INK_Outline` returns, nested by each item's depth. */
export function parseOutline(text: string): Outline {
  const what = 'The outline'
  const root = object(parse(text, what), what)
  if (typeof root.truncated !== 'boolean') throw fail(what)
  const items: OutlineEntry[] = []
  // The open ancestors of the next item. A depth that skips levels attaches to the nearest
  // ancestor there is.
  const stack: { depth: number; entry: OutlineEntry }[] = []
  for (const raw of array(root.items, what)) {
    const item = object(raw, what)
    const depth = number(item.depth, what)
    if (!Number.isInteger(depth) || depth < 0) throw fail(what)
    const flags = number(item.flags, what)
    const entry: OutlineEntry = {
      title: string(item.title, what),
      bold: (flags & 2) !== 0,
      italic: (flags & 1) !== 0,
      count: number(item.count, what),
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
  return { items, truncated: root.truncated }
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
