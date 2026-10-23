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

// The field names and widget counts are the contract the form tests build on.
const FORMS = {
  'form-fields': {
    widgets: 23,
    fields: [
      'agree',
      'auto',
      'city',
      'code',
      'country',
      'email',
      // PDF.js also reports the non-terminal parent of header.ref.
      'header',
      'header.ref',
      'interests',
      'internal',
      'locked',
      'name',
      'notes',
      'pin',
      'plan',
      'reset',
      'rotated',
      'shared',
      'sig',
      'sig2',
      'styled',
    ],
  },
  'form-scripted': {
    widgets: 18,
    fields: [
      'age',
      'ask',
      'clear',
      'discount',
      'due',
      'extra',
      'hello',
      'link',
      'mail',
      'more',
      'price',
      'print',
      'qty',
      'send',
      'site',
      'submit',
      'total',
      'when',
    ],
  },
  'form-signed': { widgets: 2, fields: ['cert', 'name'] },
  'form-fieldmdp': { widgets: 3, fields: ['amount', 'approved', 'memo'] },
  'form-timer': { widgets: 2, fields: ['note', 'ticker'] },
  'form-uppercase': { widgets: 1, fields: ['code'] },
  'form-shared-scripted': { widgets: 2, fields: ['shared'] },
  'form-range': { widgets: 3, fields: ['clear', 'note', 'score'] },
  'form-structure': { widgets: 3, fields: ['first', 'second', 'third'] },
  'form-goto': {
    widgets: 7,
    fields: [
      'chain',
      'explicit',
      'goto-script',
      'legacy',
      'missing',
      'named',
      'scripted',
    ],
  },
} as const satisfies Partial<Record<FixtureName, { widgets: number; fields: string[] }>>

const formNames = Object.keys(FORMS) as (keyof typeof FORMS)[]

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

  it.each(formNames)(
    'form fixtures open and report their widget counts: %s',
    async (name) => {
      expect(manifest[name].annotations?.Widget).toBe(FORMS[name].widgets)
      const task = await open(name)
      const doc = await task.promise
      let widgets = 0
      for (let i = 1; i <= doc.numPages; i++) {
        const annots = await (await doc.getPage(i)).getAnnotations()
        widgets += annots.filter(
          (a: { subtype: string }) => a.subtype === 'Widget'
        ).length
      }
      expect(widgets).toBe(FORMS[name].widgets)
      await task.destroy()
    }
  )

  it.each(formNames)(
    'PDF.js reports fieldObjects with the expected names: %s',
    async (name) => {
      const task = await open(name)
      const doc = await task.promise
      const objects = await doc.getFieldObjects()
      expect([...(objects?.keys() ?? [])].sort()).toEqual([...FORMS[name].fields].sort())
      await task.destroy()
    }
  )
})
