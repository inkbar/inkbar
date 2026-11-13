// node:test's describe and it return promises the runner itself awaits.
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  acceptKeys,
  agrees,
  checkLang,
  fromTagged,
  hostFor,
  outsideRepo,
  parseAccept,
  REPO,
  sourcesOf,
  staleKeys,
  toTagged,
} from './translate.ts'

/** A message function with its English kept as `source`, as `template` and `plural` make. */
function withSource(source: object): () => string {
  const fn = () => ''
  Object.defineProperty(fn, 'source', { value: source, enumerable: false })
  return fn
}

const en = {
  lang: 'en',
  find: {
    field: 'Find in document',
    count: withSource({ text: '{current} of {total}' }),
  },
  search: {
    resultCount: withSource({
      param: 'count',
      forms: { one: '{count} result', other: '{count} results' },
    }),
  },
}

describe('tags', () => {
  it('sends placeholders as XML tags and reads them back', () => {
    const tagged = toTagged('Page {page} of {total}')
    assert.equal(tagged, 'Page <x id="page"/> of <x id="total"/>')
    assert.equal(fromTagged(tagged), 'Page {page} of {total}')
  })

  it('reads back a tag written with a space or a closing tag', () => {
    assert.equal(
      fromTagged('Seite <x id="page" /> von <x id="total"></x>'),
      'Seite {page} von {total}'
    )
  })
})

describe('agrees', () => {
  it('ignores case, outer and repeated whitespace, and apostrophe style', () => {
    assert.equal(agrees('Surligner', ' surligner '), true)
    assert.equal(agrees("L'outil", 'L’outil'), true)
    assert.equal(agrees('Forme\u202f: {kind}', 'Forme : {kind}'), true)
  })

  it('does not match different words', () => {
    assert.equal(agrees('Surligner', 'Mettre en surbrillance'), false)
  })
})

describe('hostFor', () => {
  it('uses the free host for a free key', () => {
    assert.equal(hostFor('abc:fx'), 'api-free.deepl.com')
    assert.equal(hostFor('abc'), 'api.deepl.com')
  })
})

describe('outsideRepo', () => {
  it('rejects the repo and paths under it', () => {
    assert.equal(outsideRepo(REPO), false)
    assert.equal(outsideRepo(join(REPO, 'out')), false)
    assert.equal(outsideRepo(join(REPO, 'packages', 'core', 'x')), false)
  })

  it('accepts a path elsewhere', () => {
    assert.equal(outsideRepo(join(tmpdir(), 'inkbar-translate')), true)
    assert.equal(outsideRepo(`${REPO}-other`), true)
  })
})

describe('sources', () => {
  it('records strings, template text and plural forms', () => {
    assert.deepEqual(sourcesOf(en), {
      'find.field': 'Find in document',
      'find.count': '{current} of {total}',
      'search.resultCount': JSON.stringify({
        one: '{count} result',
        other: '{count} results',
      }),
    })
  })

  it('staleKeys returns changed keys and keys with no entry', () => {
    const recorded = {
      'find.field': 'Find in the document',
      'find.count': '{current} of {total}',
    }
    assert.deepEqual(staleKeys(en, recorded), ['find.field', 'search.resultCount'])
    assert.deepEqual(staleKeys(en, sourcesOf(en)), [])
  })
})

describe('accept', () => {
  const recorded = {
    'find.count': 'old count',
    'find.field': 'old field',
    'search.resultCount': 'old forms',
  }
  const file = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'inkbar-accept-')), 'fr.sources.json')
    writeFileSync(path, JSON.stringify(recorded))
    return path
  }
  const read = (path: string) =>
    JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>

  it('rewrites only the named keys', () => {
    const path = file()
    acceptKeys(path, en, ['find.field'])
    assert.deepEqual(read(path), { ...recorded, 'find.field': 'Find in document' })
  })

  it('rewrites every key with all', () => {
    const path = file()
    acceptKeys(path, en, 'all')
    assert.deepEqual(read(path), sourcesOf(en))
  })

  it('refuses a key English does not have', () => {
    const path = file()
    assert.throws(() => acceptKeys(path, en, ['find.nope']), /find\.nope/)
    assert.deepEqual(read(path), recorded)
  })
})

describe('languages', () => {
  it('accepts a shipped language', () => {
    assert.doesNotThrow(() => checkLang('fr'))
    assert.doesNotThrow(() => checkLang('de'))
  })

  it('rejects a path, a malformed tag, English and a language with no locale file', () => {
    assert.throws(() => checkLang('../fr'), /Not a language tag/)
    assert.throws(() => checkLang('fr/../../x'), /Not a language tag/)
    assert.throws(() => checkLang('FR'), /Not a language tag/)
    assert.throws(() => checkLang(''), /Not a language tag/)
    assert.throws(() => checkLang('en'), /English is the source/)
    assert.throws(() => checkLang('it'), /No packages\/core\/src\/locales\/it\.ts/)
  })

  it('checks the language --accept is given', () => {
    assert.throws(() => parseAccept(['../fr', 'find.field']), /Not a language tag/)
    assert.throws(() => parseAccept(['zz', '--all']), /No packages/)
  })
})

describe('--accept arguments', () => {
  it('takes keys, or --all on its own', () => {
    assert.deepEqual(parseAccept(['fr', 'find.field', 'find.next']), {
      lang: 'fr',
      keys: ['find.field', 'find.next'],
    })
    assert.deepEqual(parseAccept(['de', '--all']), { lang: 'de', keys: 'all' })
  })

  it('refuses --all with keys, in either order', () => {
    assert.throws(
      () => parseAccept(['fr', 'find.field', '--all']),
      /--all accepts every key/
    )
    assert.throws(
      () => parseAccept(['fr', '--all', 'find.field']),
      /--all accepts every key/
    )
  })

  it('refuses no keys and other flags', () => {
    assert.throws(() => parseAccept(['fr']), /Usage/)
    assert.throws(() => parseAccept([]), /Usage/)
    assert.throws(() => parseAccept(['fr', '--compare']), /Not a key: --compare/)
  })
})
