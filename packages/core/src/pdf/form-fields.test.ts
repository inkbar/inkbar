import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { readFormExtras, type FormExtras } from './form-fields'
import { isDict, isName } from './lexer'
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
    })
  })

  it('reads explicit GoTo pages, and named ones through the resolver', async () => {
    const objs = (await openPdfObjects(await fixtureBytes('form-goto')))!
    const ids = await widgetIds(objs)
    const plain = await readFormExtras(objs, ids)
    // Without a resolver only the explicit destination has a page.
    expect([...plain.destPages.values()]).toEqual([2])
    const asked: string[] = []
    const named = { 'chapter-3': 2, ch2: 1 } as Record<string, number>
    const extras = await readFormExtras(objs, ids, {
      destinationPage: (name) => {
        asked.push(name)
        return Promise.resolve(named[name])
      },
    })
    expect(asked).toEqual(['chapter-3', 'ch2', 'nowhere', 'chapter-3'])
    // explicit, named, legacy, then the script's /Next; `missing` names nothing.
    expect([...extras.destPages.values()]).toEqual([2, 2, 1, 2])
  })
})
