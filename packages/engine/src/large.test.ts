import { readFile } from 'node:fs/promises'

import { generateLarge } from '@inkbar/fixtures/generate-large'
import { expect, test } from 'vitest'

import { engineOver } from './engine.ts'
import { createInThreadTransport } from './transport/in-thread.ts'

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

test('a 1,000-page file opens, renders and saves', async () => {
  const wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  const transport = await createInThreadTransport({ wasm })
  const engine = engineOver(transport)
  try {
    const bytes = await generateLarge(1000)
    const doc = await engine.open(bytes)
    const afterOpen = transport.heapBytes
    expect(doc.pageCount).toBe(1000)
    expect((await doc.renderPage(999)).width).toBeGreaterThan(0)
    const afterRender = transport.heapBytes
    const saved = await doc.save()
    const afterSave = transport.heapBytes
    const again = await engine.open(saved)
    expect(again.pageCount).toBe(1000)
    console.log(
      `1000 pages: input ${mb(bytes.length)}, saved ${mb(saved.length)}, heap after open ${mb(afterOpen)}, after render ${mb(afterRender)}, after save ${mb(afterSave)}`
    )
  } finally {
    await engine.destroy()
  }
}, 120_000)
