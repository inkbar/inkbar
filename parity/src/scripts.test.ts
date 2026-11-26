import { describe, expect, it } from 'vitest'

import { scriptDifferences, type ScriptRead } from './scripts'

const read = (): ScriptRead => ({
  scripts: {
    calculationOrder: ['total'],
    calculationOrderIds: ['12R'],
    document: [
      { name: 'init', source: 'var rate = 0.2;' },
      { name: 'util', source: 'function f() {}' },
    ],
    documentActions: { WillPrint: ['app.alert(1)'] },
    fields: [
      {
        name: 'total',
        id: '11R',
        widgets: ['12R'],
        container: { fullName: 'total', kids: ['12R'], page: 0, rotation: 0 },
      },
    ],
  },
  pages: [{}, { PageOpen: ['this.getField("total")'] }],
})

describe('scriptDifferences', () => {
  it('finds equal scripts the same', () => {
    expect(scriptDifferences(read(), read())).toEqual([])
    expect(
      scriptDifferences(
        { scripts: undefined, pages: [{}] },
        { scripts: undefined, pages: [{}] }
      )
    ).toEqual([])
  })

  it('names the document script whose source differs by one character', () => {
    const other = read()
    other.scripts!.document[0] = { name: 'init', source: 'var rate = 0.3;' }
    expect(scriptDifferences(read(), other)).toEqual([
      'document script "init": source: PDF.js "var rate = 0.2;", engine "var rate = 0.3;"',
    ])
  })

  it('shows where a long source first differs', () => {
    const long = (end: string) => `${'x'.repeat(100)}${end}${'y'.repeat(100)}`
    const a = read()
    const b = read()
    a.scripts!.document[1]!.source = long('a')
    b.scripts!.document[1]!.source = long('b')
    expect(scriptDifferences(a, b)).toEqual([
      `document script "util": source from character 100: PDF.js "a${'y'.repeat(39)}", engine "b${'y'.repeat(39)}"`,
    ])
  })

  it("names a page's action, the calculation order and a field entry that differ", () => {
    const other = read()
    other.pages[1] = { PageOpen: ['this.getField("totals")'] }
    other.scripts!.calculationOrder = ['sum']
    other.scripts!.fields[0]!.container!.page = -1
    expect(scriptDifferences(read(), other)).toEqual([
      'calculationOrder: PDF.js ["total"], engine ["sum"]',
      'fields[0].container.page: PDF.js 0, engine -1',
      'page 2: PageOpen: PDF.js ["this.getField(\\"total\\")"], engine ["this.getField(\\"totals\\")"]',
    ])
  })

  it('names a file that has scripts with one reader only', () => {
    expect(scriptDifferences(read(), { ...read(), scripts: undefined })).toEqual([
      'scripts: PDF.js some, engine none',
    ])
  })
})
