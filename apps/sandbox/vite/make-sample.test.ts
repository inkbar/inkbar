import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { PDFArray, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'

import { makeSample } from './make-sample.ts'

void test('the sample is a six-page document', async () => {
  const d = await PDFDocument.load(await makeSample())
  assert.equal(d.getPageCount(), 6)
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
  assert.deepEqual(a, b)
})

const fixture = async (name: string): Promise<PDFDocument> =>
  PDFDocument.load(
    await readFile(new URL(`../../../fixtures/pdf/${name}.pdf`, import.meta.url))
  )

const fieldNames = (d: PDFDocument): string[] =>
  d
    .getForm()
    .getFields()
    .map((f) => f.getName())
    .sort()

void test('the form pages hold every field of the form fixtures, by the same names', async () => {
  const sample = await PDFDocument.load(await makeSample())
  const expected = [
    ...fieldNames(await fixture('form-fields')),
    ...fieldNames(await fixture('form-scripted')),
  ].sort()
  assert.deepEqual(fieldNames(sample), expected)
  // Every widget sits on the two form pages.
  const formPages = new Set([sample.getPage(4).ref, sample.getPage(5).ref])
  for (const field of sample.getForm().getFields())
    for (const widget of field.acroField.getWidgets())
      assert.ok(formPages.has(widget.P()!), `${field.getName()} is off the form pages`)
})

void test('the form keeps the scripts of the scripted fixture', async () => {
  // PDF literal strings escape their parentheses.
  const bytes = Buffer.from(await makeSample())
    .toString('latin1')
    .replace(/\\([()\\])/g, '$1')
  for (const script of [
    'AFSimple_Calculate("PRD", new Array("qty", "price"))',
    'AFPercent_Format(1, 0)',
    'event.value = total * (1 - off);',
    'AFDate_FormatEx("dd/mm/yyyy")',
    'event.rc = event.value >= 18 && event.value <= 120',
    'app.alert("Hello")',
    'app.response("Name?")',
    'this.submitForm("https://example.com/submit")',
    'this.mailDoc(false, "forms@example.com")',
    'app.launchURL("https://example.com", true)',
    'this.print()',
    // pdf-lib writes a document-level script as UTF-16 hex.
    PDFHexString.fromText('var formReady = true;').toString(),
  ])
    assert.ok(bytes.includes(script), `missing ${script}`)
  assert.match(bytes, /\/S \/SubmitForm/)
  assert.match(bytes, /\/S \/ResetForm/)
  assert.match(bytes, /\/S \/URI/)
})
