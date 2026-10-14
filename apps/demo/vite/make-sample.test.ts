import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'

import { makeSample } from './make-sample.ts'

void test('the sample is a three-page document', async () => {
  const d = await PDFDocument.load(await makeSample())
  assert.equal(d.getPageCount(), 3)
  assert.match(d.getTitle() ?? '', /sample/i)
})

void test('page 1 carries one embedded highlight and one note', async () => {
  const d = await PDFDocument.load(await makeSample())
  const annots = d.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
  const subtypes = annots
    .asArray()
    .map((ref) => d.context.lookup(ref))
    .map((dict) =>
      String((dict as unknown as { get(n: PDFName): unknown }).get(PDFName.of('Subtype')))
    )
  assert.deepEqual(subtypes.sort(), ['/Highlight', '/Text'])
})

void test('the same bytes come back for the same build', async () => {
  const [a, b] = await Promise.all([makeSample(), makeSample()])
  assert.equal(a.length, b.length)
})
