import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { holdsText } from './pdf-bytes'
import { qpdfQdf } from './qpdf'
import { fixtureFileForUrl } from './vite-serve'

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
  signed: { widgets: 2, fields: ['name', 'sig'] },
  certified: { widgets: 2, fields: ['name', 'sig'] },
  'signed-encrypted': { widgets: 2, fields: ['name', 'sig'] },
  'form-restricted': { widgets: 2, fields: ['agree', 'name'] },
  'form-format': { widgets: 1, fields: ['amount'] },
  'form-choices': { widgets: 2, fields: ['colours', 'size'] },
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
      const { file } = manifest[name]
      // A corpus file keeps the name it has upstream, with underscores for hyphens.
      if (name.startsWith('corpus-'))
        expect(file.replaceAll('_', '-')).toBe(`${name.slice('corpus-'.length)}.pdf`)
      else expect(file).toBe(`${name}.pdf`)
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

const redaction = FIXTURE_NAMES.filter(
  (name) => name.startsWith('redact-') || name.startsWith('check-')
)
const badlyRedacted = FIXTURE_NAMES.filter((name) => name.startsWith('bad-'))

describe('redaction fixtures', () => {
  /** The text PDF.js reads from every page of a fixture, page by page. */
  async function pageTexts(name: FixtureName): Promise<string[]> {
    const task = await open(name, manifest[name].password)
    const doc = await task.promise
    const texts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
    }
    await task.destroy()
    return texts
  }

  it.each(redaction)('%s holds its secrets and the text it keeps', async (name) => {
    const { secrets, keeps, regions, gone, password } = manifest[name]
    expect(regions?.length).toBeGreaterThan(0)
    const text = (await pageTexts(name)).join('\n')
    const bytes = await fixtureBytes(name)
    for (const word of keeps ?? []) expect(text, word).toContain(word)
    // A secret may sit in an annotation rather than in the page's text. An encrypted file is
    // read as qpdf decrypts it, objects nothing refers to included.
    const readable = password
      ? Buffer.from(await qpdfQdf(bytes, { password, unreferenced: true }), 'latin1')
      : bytes
    for (const word of secrets ?? []) expect(holdsText(readable, word), word).toBe(true)
    // What sanitising must remove is there to remove.
    for (const word of gone ?? []) expect(holdsText(bytes, word), word).toBe(true)
    // Every stream is compressed and every string in a dictionary is hex, so the plain bytes
    // hold none of the words.
    const plain = Buffer.from(bytes).toString('latin1')
    for (const word of [...(secrets ?? []), ...(keeps ?? [])])
      expect(plain.includes(word), word).toBe(false)
  })

  it.each(redaction)('%s puts each region inside a page', async (name) => {
    const { pages, regions, password } = manifest[name]
    const task = await open(name, password)
    const doc = await task.promise
    for (const { page, quad } of regions ?? []) {
      expect(page).toBeLessThan(pages)
      const [left, bottom, right, top] = (await doc.getPage(page + 1)).view
      const xs = quad.filter((_, i) => i % 2 === 0)
      const ys = quad.filter((_, i) => i % 2 === 1)
      expect(xs.every((x) => x >= (left as number) && x <= (right as number))).toBe(true)
      expect(ys.every((y) => y >= (bottom as number) && y <= (top as number))).toBe(true)
    }
    await task.destroy()
  })

  it.each(badlyRedacted)(
    '%s still holds its secrets and has no regions',
    async (name) => {
      const { secrets = [], keeps = [], regions } = manifest[name]
      expect(regions).toBeUndefined()
      expect(secrets.length).toBeGreaterThan(0)
      const text = (await pageTexts(name)).join('\n')
      const bytes = await fixtureBytes(name)
      for (const word of keeps) expect(text, word).toContain(word)
      for (const word of secrets) expect(holdsText(bytes, word), word).toBe(true)
      // The appended revision draws the page without the secret; the others still show it.
      for (const word of secrets)
        expect(text.includes(word), word).toBe(name !== 'bad-appended')
      const plain = Buffer.from(bytes).toString('latin1')
      for (const word of [...secrets, ...keeps])
        expect(plain.includes(word), word).toBe(false)
    }
  )

  it('bad-appended has two revisions', async () => {
    const plain = Buffer.from(await fixtureBytes('bad-appended')).toString('latin1')
    expect(plain.match(/%%EOF/g)).toHaveLength(2)
    expect(plain).toMatch(/\/Prev \d+/)
  })
})

const unembedded = FIXTURE_NAMES.filter((name) => name.startsWith('unembedded-'))
const corpus = FIXTURE_NAMES.filter((name) => name.startsWith('corpus-'))

const FONT_FILE_KEYS = /\/FontFile[23]?(?![A-Za-z0-9])/

const EXPECTED_UNEMBEDDED = {
  'unembedded-japanese': ['japanese'],
  'unembedded-simplified-chinese': ['simplified-chinese'],
  'unembedded-traditional-chinese': ['traditional-chinese'],
  'unembedded-korean': ['korean'],
  'unembedded-cyrillic': ['default'],
  'unembedded-greek': ['default'],
  'unembedded-arial': [],
} as const

/** The features every corpus file is in the suite for, at least one file each. */
const CORPUS_FEATURES = [
  'axial-shading',
  'radial-shading',
  'mesh-shading',
  'tiling-pattern',
  'blend-mode',
  'soft-mask',
  'type3-font',
  'jpeg2000',
  'jbig2',
  'ccitt',
  'icc-colour',
  'clip',
  'rotated-page',
  'cropped-page',
  'dash',
  'text-render-mode',
]

describe('unembedded-font fixtures', () => {
  it('are exactly the expected set, with the fallback fonts they need', () => {
    expect([...unembedded].sort()).toEqual(Object.keys(EXPECTED_UNEMBEDDED).sort())
    for (const name of unembedded)
      expect(manifest[name].unembedded, name).toEqual(
        EXPECTED_UNEMBEDDED[name as keyof typeof EXPECTED_UNEMBEDDED]
      )
  })

  it.each(unembedded)(
    '%s opens with its page count and embeds no font file',
    async (name) => {
      expect(existsSync(fixturePath(name))).toBe(true)
      const task = await open(name)
      const doc = await task.promise
      expect(doc.numPages).toBe(manifest[name].pages)
      await task.destroy()
      // The objects are written as plain text, so a font file would show as a key.
      const plain = Buffer.from(await fixtureBytes(name)).toString('latin1')
      expect(FONT_FILE_KEYS.test(plain), name).toBe(false)
      expect(plain).toContain('/FontDescriptor')
    }
  )
})

describe('corpus fixtures', () => {
  it('has between 30 and 50 entries', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(30)
    expect(corpus.length).toBeLessThanOrEqual(50)
  })

  it.each(corpus)('%s names its source and features, and has a file', (name) => {
    const { source, features } = manifest[name]
    expect(source, name).toMatch(/^pdfium testing\/resources\//)
    expect(features?.length, name).toBeGreaterThan(0)
    expect(existsSync(fixturePath(name)), name).toBe(true)
  })

  it('covers every drawing feature', () => {
    const covered = new Set(corpus.flatMap((name) => manifest[name].features ?? []))
    for (const feature of CORPUS_FEATURES)
      expect(covered.has(feature), feature).toBe(true)
  })

  it('claims only the features it lists', () => {
    const covered = new Set(corpus.flatMap((name) => manifest[name].features ?? []))
    for (const feature of covered) expect(CORPUS_FEATURES, feature).toContain(feature)
  })
})

describe('fixture URLs', () => {
  it('map to the file the server streams, for every fixture', () => {
    for (const name of FIXTURE_NAMES)
      expect(fixtureFileForUrl(`${fixtureUrl(name)}?v=1`), name).toBe(fixturePath(name))
  })

  it('send a corpus name to the corpus directory', () => {
    expect(fixtureFileForUrl(fixtureUrl('corpus-bug-1883'))).toMatch(
      /[\\/]fixtures[\\/]corpus[\\/]bug_1883\.pdf$/
    )
  })

  it('leave other URLs, and unknown corpus names, to the next handler', () => {
    expect(fixtureFileForUrl('/pdfjs/build/pdf.mjs')).toBeUndefined()
    expect(fixtureFileForUrl('/fixtures/corpus-nothing-here.pdf')).toBeUndefined()
  })
})
