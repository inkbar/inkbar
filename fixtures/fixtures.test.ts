import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import {
  FIXTURE_NAMES,
  fixtureBytes,
  fixturePath,
  fixtureUrl,
  manifest,
  type FixtureName,
} from './index'

const require = createRequire(import.meta.url)

async function pdfjs() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs')
  mod.GlobalWorkerOptions.workerSrc =
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  return mod
}

// The malformed fixtures make PDF.js warn ("Indexing all PDF objects") while it rebuilds the
// xref. That warning is the expected behaviour, so it is silenced for those files only.
const quiet = (name: FixtureName) => name.startsWith('malformed-')

async function open(name: FixtureName, password?: string) {
  const lib = await pdfjs()
  return lib.getDocument({
    data: await fixtureBytes(name),
    ...(password === undefined ? {} : { password }),
    // PDF.js verbosity is global, so set it on every open rather than only the quiet ones.
    verbosity: quiet(name) ? lib.VerbosityLevel.ERRORS : lib.VerbosityLevel.WARNINGS,
  })
}

describe('fixtures corpus', () => {
  const names = Object.keys(manifest) as FixtureName[]

  it('manifest lists exactly the known fixture names', () => {
    expect([...names].sort()).toEqual([...FIXTURE_NAMES].sort())
    for (const name of names) {
      expect(manifest[name].file).toBe(`${name}.pdf`)
      expect(fixtureUrl(name)).toBe(`/fixtures/${name}.pdf`)
    }
  })

  it('has a file for every manifest entry', () => {
    for (const name of names) expect(existsSync(fixturePath(name)), name).toBe(true)
  })

  it.each(names.filter((n) => manifest[n].opens))(
    '%s opens with the expected page count',
    async (name) => {
      const task = await open(name, manifest[name].password)
      const doc = await task.promise
      expect(doc.numPages).toBe(manifest[name].pages)
      await task.destroy()
    }
  )

  it('userunit-2 reports /UserUnit 2 on every page', async () => {
    const task = await open('userunit-2')
    const doc = await task.promise
    expect(doc.numPages).toBe(3)
    for (let i = 1; i <= doc.numPages; i++) {
      expect((await doc.getPage(i)).userUnit).toBe(2)
    }
    await task.destroy()
  })

  it('malformed-truncated fails to open', async () => {
    const task = await open('malformed-truncated')
    await expect(task.promise).rejects.toThrow()
  })

  it.each(['encrypted-aes', 'encrypted-rc4'] as const)(
    '%s needs a password',
    async (name) => {
      const task = await open(name)
      await expect(task.promise).rejects.toMatchObject({ name: 'PasswordException' })
    }
  )
})
