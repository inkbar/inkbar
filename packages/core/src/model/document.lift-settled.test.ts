import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../test-support/node-assets'

import { openDocument, type InkDocument } from './document'

import type * as EmbeddedFields from './annotations/embedded-fields'

// The lift pass waits on the file's objects for as long as the test says.
const lifting = vi.hoisted(() => ({ hang: false }))
vi.mock('./annotations/embedded-fields', async (importOriginal) => {
  const real = await importOriginal<typeof EmbeddedFields>()
  return {
    ...real,
    readLifted: (...args: Parameters<typeof real.readLifted>) =>
      lifting.hang ? new Promise<never>(() => undefined) : real.readLifted(...args),
  }
})

const opened: InkDocument[] = []
afterEach(() => {
  lifting.hang = false
  opened.splice(0).forEach((d) => d.destroy())
})

async function open(name: Parameters<typeof fixtureBytes>[0], password?: string) {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    ...(password ? { password } : {}),
  })
  opened.push(doc)
  return doc
}

/** Whether `p` has settled once pending callbacks have run. */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false
  void p.then(
    () => (done = true),
    () => (done = true)
  )
  await new Promise((r) => setTimeout(r, 20))
  return done
}

describe('_liftSettled', () => {
  it('resolves for a document destroyed while it waits for a password', async () => {
    const doc = await open('saved-encrypted')
    expect(doc.status.get()).toMatchObject({
      state: 'error',
      error: { code: 'PasswordRequired' },
    })
    doc.destroy()
    await expect(doc._liftSettled).resolves.toBeUndefined()
  })

  it('resolves for a document destroyed while the lift pass is still reading', async () => {
    lifting.hang = true
    const doc = await open('saved-annotations')
    await doc.ready
    expect(await settled(doc._liftSettled)).toBe(false)
    doc.destroy()
    await expect(doc._liftSettled).resolves.toBeUndefined()
    expect(doc._lifted.get().size).toBe(0)
  })

  it('resolves when the open failed', async () => {
    const doc = await open('malformed-truncated')
    expect(doc.status.get().state).toBe('error')
    await expect(doc._liftSettled).resolves.toBeUndefined()
  })
})
