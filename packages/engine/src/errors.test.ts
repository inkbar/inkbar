import { expect, test } from 'vitest'

import { fromPdfiumError } from './errors.ts'

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
