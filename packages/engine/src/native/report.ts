// Reading the module's JSON reports. Each report is checked as it is read: a shape the module
// never writes comes from another module, and is an `engine-failure` whose cause names the key.
import { EngineError } from '../errors.ts'

import type { FileText, ObjectRef } from '../types.ts'
import type { Heap } from './strings.ts'

export type Json = Record<string, unknown>

export function fail(what: string, cause?: unknown): EngineError {
  return new EngineError('engine-failure', `${what} could not be read.`, {
    cause: cause ?? new Error('unexpected shape'),
  })
}

/** A failure whose cause names the key at fault and what it should have held. */
export function bad(what: string, key: string, expected: string): EngineError {
  return fail(what, new Error(`${key}: expected ${expected}`))
}

export function parse(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw fail(what, cause)
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function object(value: unknown, what: string, key: string): Json {
  if (!isObject(value)) throw bad(what, key, 'an object')
  return value
}

export function array(value: unknown, what: string, key: string): unknown[] {
  if (!Array.isArray(value)) throw bad(what, key, 'a list')
  return value
}

export function number(value: unknown, what: string, key: string): number {
  if (typeof value !== 'number') throw bad(what, key, 'a number')
  return value
}

export function string(value: unknown, what: string, key: string): string {
  if (typeof value !== 'string') throw bad(what, key, 'a string')
  return value
}

export function hexBytes(value: unknown, what: string, key: string): Uint8Array {
  const text = string(value, what, key)
  if (text.length % 2 !== 0 || /[^0-9a-f]/i.test(text))
    throw bad(what, key, 'hex digits in pairs')
  const bytes = new Uint8Array(text.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export const present = (value: unknown): boolean => value !== null && value !== undefined

export function boolean(value: unknown, what: string, key: string): boolean {
  if (typeof value !== 'boolean') throw bad(what, key, 'a boolean')
  return value
}

/** A whole number from 0. */
export function count(value: unknown, what: string, key: string): number {
  const n = number(value, what, key)
  if (!Number.isInteger(n) || n < 0) throw bad(what, key, 'a whole number from 0')
  return n
}

/** A whole number from -1: an index, or -1 for none. */
export function indexOrNone(value: unknown, what: string, key: string): number {
  const n = number(value, what, key)
  if (!Number.isInteger(n) || n < -1) throw bad(what, key, 'a whole number from -1')
  return n
}

/** One of `values`; any other string, or anything else, is malformed. */
export function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  what: string,
  key: string
): T {
  if (!(values as readonly unknown[]).includes(value))
    throw bad(what, key, `one of ${values.join(', ')}`)
  return value as T
}

/** A key the fork writes only as `true`: absent, `null` or `true`. */
export function onlyTrue(value: unknown, what: string, key: string): boolean {
  if (!present(value)) return false
  if (value !== true) throw bad(what, key, 'true, null or no key')
  return true
}

/** A number, or `null` where the file has no finite number. */
export function numberOrNull(value: unknown, what: string, key: string): number | null {
  return value === null ? null : number(value, what, key)
}

/** A list of numbers, each `null` where the file has no finite number. */
export function numbers(value: unknown, what: string, key: string): (number | null)[] {
  return array(value, what, key).map((n) => numberOrNull(n, what, key))
}

/** A name of the file, each character the code point of one of its bytes. */
export function name(value: unknown, what: string, key: string): string {
  const text = string(value, what, key)
  // eslint-disable-next-line no-control-regex -- every code point past one byte is malformed
  if (/[^\u0000-ÿ]/.test(text)) throw bad(what, key, 'a name of bytes')
  return text
}

/** A text string: its text, or `{ bytes: "<hex>" }` for bytes in no text encoding. */
export function fileText(value: unknown, what: string, key: string): FileText {
  if (typeof value === 'string') return value
  const item = object(value, what, key)
  if (Object.keys(item).length !== 1) throw bad(what, key, 'text or { bytes }')
  return { bytes: hexBytes(item.bytes, what, key) }
}

/** `[number, generation]`. */
export function ref(value: unknown, what: string, key: string): ObjectRef {
  const [objectNumber, generation, ...rest] = array(value, what, key).map((n) =>
    count(n, what, key)
  )
  if (objectNumber === undefined || generation === undefined || rest.length > 0)
    throw bad(what, key, 'two numbers')
  return { objectNumber, generation }
}

/**
 * `objectNumber` and `generation`: both present for an object of the file, both absent for a
 * direct dictionary, which has no number.
 */
export function objectId(
  item: Json,
  what: string
): { objectNumber: number; generation: number } | Record<string, never> {
  if (!present(item.objectNumber) && !present(item.generation)) return {}
  const objectNumber = count(item.objectNumber, what, 'objectNumber')
  if (objectNumber === 0) throw bad(what, 'objectNumber', 'a number from 1')
  return { objectNumber, generation: count(item.generation, what, 'generation') }
}

/** Reads the call's JSON, then frees it. NULL means the call could not read. */
export function takeJson(heap: Heap, pointer: number, what: string): string {
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
