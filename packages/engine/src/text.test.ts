import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import { createEngine } from './index.ts'

/** A save, less the /ID PDFium makes fresh on every save of the same document. */
const withoutId = (saved: Uint8Array) =>
  Buffer.from(saved)
    .toString('latin1')
    .replace(/\/ID\s*\[[^\]]*\]/g, '/ID[]')

test('reading a page text changes nothing a later save writes', async () => {
  const wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  const bytes = await fixtureBytes('text-simple')
  const engine = await createEngine({ wasm, worker: false })
  try {
    const unread = await (await engine.open(bytes)).save()
    const again = await (await engine.open(bytes)).save()
    // The control: two saves that read nothing agree once the /ID is set aside.
    expect(withoutId(again)).toBe(withoutId(unread))
    const read = await engine.open(bytes)
    for (let page = 0; page < read.pageCount; page++) await read.pageText(page)
    expect(withoutId(await read.save())).toBe(withoutId(unread))
  } finally {
    await engine.destroy()
  }
})
