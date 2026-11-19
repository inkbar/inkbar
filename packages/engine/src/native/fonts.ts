import { EngineError } from '../errors.ts'
import { FONT_BITS } from '../fonts.ts'

import type { FontKey } from '../types.ts'
import type { Heap } from './strings.ts'

/**
 * Serves `bytes` as the font for `key` to text whose font is not in the file. The module copies
 * them, so the copy made here is freed at once. False when the module refuses them. A key is
 * registered once in a module's life: a second registration does not replace a font a loaded
 * document already holds.
 */
export function registerFont(heap: Heap, key: FontKey, bytes: Uint8Array): boolean {
  const { fn, native } = heap
  if (bytes.length === 0) return false
  const pointer = fn.malloc(bytes.length)
  if (pointer === 0)
    throw new EngineError('out-of-memory', 'The engine ran out of memory.')
  try {
    native.HEAPU8.set(bytes, pointer)
    return fn.INK_Fonts_Register(FONT_BITS[key], pointer, bytes.length) === 1
  } finally {
    if (!heap.stopped) fn.free(pointer)
  }
}

/**
 * The key bits a page needs for the fonts it names without embedding, registered or not: its
 * own, those of the forms, patterns and Type 3 fonts it uses, and those of its annotations'
 * appearances. Reads the file without loading any font.
 */
export function pageNeeds(heap: Heap, doc: number, index: number): number {
  return heap.fn.INK_Fonts_PageNeeds(doc, index)
}

/** The key bits the module asked for since the last call and found unregistered. */
export function takeMisses(heap: Heap): number {
  return heap.fn.INK_Fonts_TakeMisses()
}
