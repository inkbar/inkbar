import { expect, test } from 'vitest'

import { EngineError, fromPdfiumError } from './errors.ts'

test.each([
  [2, false, 'invalid-pdf'],
  [3, false, 'invalid-pdf'],
  [4, false, 'password-required'],
  [4, true, 'password-incorrect'],
  [5, false, 'unsupported-security'],
  [6, false, 'engine-failure'],
  [1, false, 'engine-failure'],
])('PDFium error %i (password given: %s) is %s', (n, had, code) => {
  expect(fromPdfiumError(n, had).code).toBe(code)
})

test('engine-failure carries the PDFium number', () => {
  expect(fromPdfiumError(6, false).pdfiumError).toBe(6)
})

test('a refusal keeps its reason, marks and kinds across the worker boundary', async () => {
  const { toWire } = await import('./transport/worker-host.ts')
  const { fromWire } = await import('./transport/worker.ts')
  const refused = new EngineError('redaction-failed', 'refused', {
    page: 2,
    reason: 'unremovable-content',
    marks: ['a', 'b'],
    kinds: ['pattern', 'glyph'],
  })
  expect(fromWire(structuredClone(toWire(refused)))).toMatchObject({
    name: 'EngineError',
    code: 'redaction-failed',
    page: 2,
    reason: 'unremovable-content',
    marks: ['a', 'b'],
    kinds: ['pattern', 'glyph'],
  })
})
