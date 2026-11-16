import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import type { createEngine as CreateEngine } from './index.ts'

// Runs against the built package; the `test` script builds first.
test('the built package finds its own wasm and opens a document', async () => {
  const built = new URL('../dist/index.mjs', import.meta.url)
  await access(built)
  const { createEngine } = (await import(pathToFileURL(built.pathname).href)) as {
    createEngine: typeof CreateEngine
  }
  const engine = await createEngine({ worker: false })
  try {
    const doc = await engine.open(await fixtureBytes('text-simple'))
    expect(doc.pageCount).toBe(3)
  } finally {
    await engine.destroy()
  }
})
