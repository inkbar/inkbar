import { EngineError } from '../errors.ts'

import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'

/**
 * What the write helpers need from the core: the module's functions, guarded so a trap stops
 * the engine, its memory, and whether a trap has happened. After a trap nothing is freed: the
 * heap is unusable and a second call would hide the first error.
 */
export interface Heap {
  readonly fn: Native
  readonly native: NativeModule
  readonly stopped: boolean
}

function allocate(heap: Heap, size: number): number {
  const pointer = heap.fn.malloc(Math.max(size, 1))
  if (pointer === 0)
    throw new EngineError('out-of-memory', 'The engine ran out of memory.')
  return pointer
}

/** Runs `use` with a block of `size` bytes that `fill` writes, and frees the block after. */
function withBlock<T>(
  heap: Heap,
  size: number,
  fill: (pointer: number) => void,
  use: (pointer: number) => T
): T {
  const pointer = allocate(heap, size)
  try {
    fill(pointer)
    return use(pointer)
  } finally {
    if (!heap.stopped) heap.fn.free(pointer)
  }
}

/** `text` as a NUL-terminated UTF-8 string. `length` is its byte count without the NUL. */
export function withUtf8<T>(
  heap: Heap,
  text: string,
  use: (pointer: number, length: number) => T
): T {
  const length = heap.native.lengthBytesUTF8(text)
  return withBlock(
    heap,
    length + 1,
    (pointer) => {
      heap.native.stringToUTF8(text, pointer, length + 1)
    },
    (pointer) => use(pointer, length)
  )
}

/** `text` as a NUL-terminated UTF-16LE string. `length` is its code unit count without the NUL. */
export function withUtf16<T>(
  heap: Heap,
  text: string,
  use: (pointer: number, length: number) => T
): T {
  return withBlock(
    heap,
    (text.length + 1) * 2,
    (pointer) => {
      const bytes = heap.native.HEAPU8
      for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i)
        bytes[pointer + i * 2] = unit & 0xff
        bytes[pointer + i * 2 + 1] = unit >> 8
      }
      bytes[pointer + text.length * 2] = 0
      bytes[pointer + text.length * 2 + 1] = 0
    },
    (pointer) => use(pointer, text.length)
  )
}

/** A copy of `bytes` in engine memory. */
export function withBytes<T>(
  heap: Heap,
  bytes: Uint8Array,
  use: (pointer: number, length: number) => T
): T {
  return withBlock(
    heap,
    bytes.length,
    (pointer) => {
      heap.native.HEAPU8.set(bytes, pointer)
    },
    (pointer) => use(pointer, bytes.length)
  )
}

/** `numbers` as 32-bit floats, the layout of PDFium's point, quad and rectangle structs. */
export function withFloats<T>(
  heap: Heap,
  numbers: readonly number[],
  use: (pointer: number, length: number) => T
): T {
  return withBlock(
    heap,
    numbers.length * 4,
    (pointer) => {
      // malloc returns blocks aligned for any type, so the index is whole.
      heap.native.HEAPF32.set(numbers, pointer / 4)
    },
    (pointer) => use(pointer, numbers.length)
  )
}
