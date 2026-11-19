import { expect, test, vi } from 'vitest'

import { EngineError } from '../errors.ts'

import { readReport } from './inspect.ts'

import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'
import type { Heap } from './strings.ts'

/** A heap holding `text` at byte 8, with or without a NUL after it. */
function heapWith(text: string, terminated: boolean) {
  const encoded = new TextEncoder().encode(text)
  const bytes = new Uint8Array(8 + encoded.length + (terminated ? 1 : 0))
  bytes.fill(0x20, 0, 8)
  bytes.set(encoded, 8)
  const free = vi.fn()
  const heap = {
    fn: { INK_Inspect_Free: free } as unknown as Native,
    native: { HEAPU8: bytes } as unknown as NativeModule,
    stopped: false,
  } satisfies Heap
  return { heap, free }
}

const fail = () => new EngineError('check-failed', 'The report could not be read.')

test('a report is read up to its NUL and freed', () => {
  const { heap, free } = heapWith('{"regions":[]}', true)
  expect(readReport(heap, 8, fail)).toEqual({ regions: [] })
  expect(free).toHaveBeenCalledWith(8)
})

test('a report with no NUL before the end of memory fails and is freed', () => {
  // Without the NUL the last byte would be dropped: `{"a":1}}` would read as `{"a":1}`.
  const { heap, free } = heapWith('{"a":1}}', false)
  expect(() => readReport(heap, 8, fail)).toThrow(
    expect.objectContaining({ code: 'check-failed' })
  )
  expect(free).toHaveBeenCalledWith(8)
})
