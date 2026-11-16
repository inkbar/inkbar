import { access } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import type { createEngine as CreateEngine } from './index.ts'

// Runs against the built package; turbo builds it before `test`.
test('the built package finds its own wasm and opens a document', async () => {
  const built = new URL('../dist/index.mjs', import.meta.url)
  await access(built).catch(() => {
    throw new Error('dist/index.mjs is missing: build the package first (pnpm build)')
  })
  const { createEngine } = (await import(built.href)) as {
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
