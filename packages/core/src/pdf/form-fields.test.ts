import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { readFormExtras, type FormExtras } from './form-fields'
import { isDict, isName, type PdfValue } from './lexer'
import { openPdfObjects, type PdfObjects } from './objects'

/** PDF.js-style ids (`12R`) of every Widget object in the file. */
async function widgetIds(objs: PdfObjects): Promise<string[]> {
  const ids: string[] = []
  for (let num = 1; num < 200; num++) {
    const v = await objs.get({ kind: 'ref', num, gen: 0 })
    if (isDict(v) && isName(v.entries.get('Subtype'), 'Widget')) ids.push(`${num}R`)
  }
  return ids
}

async function extrasOf(
  name: FixtureName
): Promise<{ extras: FormExtras; ids: string[] }> {
  const objs = (await openPdfObjects(await fixtureBytes(name)))!
  const ids = await widgetIds(objs)
  return { extras: await readFormExtras(objs, ids), ids }
}

describe('readFormExtras', () => {
  it('reads a SubmitForm action', async () => {
    const { extras } = await extrasOf('form-scripted')
    expect([...extras.submits.values()]).toEqual([
      {
        kind: 'submit',
        url: 'https://example.com/xfdf',
        format: 'xfdf',
        include: true,
        fields: [],
      },
    ])
    // `send` is the 58R widget PDF.js reports.
    expect(extras.submits.has('58R')).toBe(true)
  })

  it('marks a certificate-signed field', async () => {
    const { extras } = await extrasOf('form-signed')
    expect(extras.signed).toEqual(new Set(['cert']))
  })

  it('locks everything under DocMDP P=1', async () => {
    const { extras } = await extrasOf('form-signed')
    expect(extras.lockAll).toBe(true)
  })

  it('locks only the fields a signed /Lock names', async () => {
    const { extras } = await extrasOf('form-fieldmdp')
    expect(extras.lockAll).toBe(false)
    expect(extras.signed).toEqual(new Set(['approved']))
    expect(extras.lockedFields).toEqual(new Set(['amount']))
  })

  it('reads /Tabs', async () => {
    const { extras } = await extrasOf('form-fields')
    expect(extras.tabs.get(0)).toBe('R')
    expect(extras.tabs.has(1)).toBe(false)
  })

  it('reads on-states and the stored state of a shared export value', async () => {
    const { extras } = await extrasOf('form-fields')
    const states = [...extras.widgets.values()].flatMap((w) =>
      w.onState === undefined ? [] : [w.onState]
    )
    expect(states).toEqual(['Yes', 'monthly', 'yearly', '0', '1'])
  })

  it('returns empty extras for an unreadable file', async () => {
    const objs = await openPdfObjects(await fixtureBytes('malformed-truncated'))
    const extras = await readFormExtras(objs, ['1R'])
    expect(extras).toEqual({
      submits: new Map(),
      signed: new Set(),
      lockedFields: new Set(),
      lockAll: false,
      tabs: new Map(),
      widgets: new Map(),
      destPages: new Map(),
      scriptActions: new Set(),
      next: new Map(),
    })
  })

  it('reads explicit GoTo pages, and named ones through the resolver', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-goto')))!
    const ids = await widgetIds(objs)
    const plain = await readFormExtras(objs, ids)
    // Without a resolver only the explicit destinations have a page.
    expect([...plain.destPages.values()]).toEqual([2, 1])
    const asked: string[] = []
    const named = { 'chapter-3': 2, ch2: 1 } as Record<string, number>
    const extras = await readFormExtras(objs, ids, {
      destinationPage: (name) => {
        asked.push(name)
        return Promise.resolve(named[name])
      },
    })
    // Each name is asked once, however many widgets go to it.
    expect(asked).toEqual(['chapter-3', 'ch2', 'nowhere'])
    // explicit, named, legacy and goto-script; `missing` names nothing.
    expect([...extras.destPages.values()]).toEqual([2, 2, 1, 1])
  })

  it('reads JavaScript /A actions from their own /S and walks the /Next chain', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-goto')))!
    const ids = await widgetIds(objs)
    const extras = await readFormExtras(objs, ids, {
      destinationPage: (name) => Promise.resolve(name === 'chapter-3' ? 2 : undefined),
    })
    // scripted and chain; goto-script is a GoTo with JavaScript only in its /Next.
    expect([...extras.scriptActions]).toEqual(['30R', '38R'])
    expect(Object.fromEntries(extras.next)).toEqual({
      '30R': [{ kind: 'goto', page: 2 }],
      '38R': [
        { kind: 'uri', url: 'https://example.com/next' },
        { kind: 'goto', page: 1 },
        { kind: 'named', name: 'Print' },
      ],
    })
  })

  it('looks a string destination name up by its raw bytes', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-goto')))!
    const asked: string[] = []
    const raw = { kind: 'string', bytes: Uint8Array.from([0x63, 0xe9]) } as const
    // A GoTo to (c\351): PDF.js keys its name tree by the bytes, not the decoded text.
    const get = objs.get.bind(objs)
    objs.get = async (ref) => {
      const v = await get(ref)
      if (ref.num === 13 && isDict(v)) {
        const a = v.entries.get('A')
        const action = isDict(a) ? a : undefined
        action?.entries.set('D', raw)
      }
      return v
    }
    await readFormExtras(objs, ['13R'], {
      destinationPage: (name) => (asked.push(name), Promise.resolve(undefined)),
    })
    expect(asked).toEqual(['c\u00e9'])
  })

  it('stops a /Next chain that cycles back to an indirect /A', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-goto')))!
    // 13R's /A becomes 900 0 R: a GoTo to page 3 whose /Next is itself.
    const looped = {
      kind: 'dict',
      entries: new Map<string, PdfValue>([
        ['S', { kind: 'name', name: 'GoTo' }],
        [
          'D',
          [
            { kind: 'ref', num: 7, gen: 0 },
            { kind: 'name', name: 'Fit' },
          ],
        ],
        ['Next', { kind: 'ref', num: 900, gen: 0 }],
      ]),
    } as const
    const get = objs.get.bind(objs)
    objs.get = async (ref) => {
      if (ref.num === 900) return looped
      const v = await get(ref)
      if (ref.num === 13 && isDict(v))
        v.entries.set('A', { kind: 'ref', num: 900, gen: 0 })
      return v
    }
    const extras = await readFormExtras(objs, ['13R'])
    expect(extras.destPages.get('13R')).toBe(2)
    expect(extras.next.has('13R')).toBe(false)
  })

  it('reads ResetForm and SubmitForm in a /Next chain', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-range')))!
    const ids = await widgetIds(objs)
    const extras = await readFormExtras(objs, ids)
    expect([...extras.next.values()]).toEqual([
      [
        { kind: 'reset', fields: ['note'], include: true },
        {
          kind: 'submit',
          url: 'https://example.com/range',
          fields: [],
          include: true,
          format: 'html',
          method: 'POST',
        },
      ],
    ])
  })
})
