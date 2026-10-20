import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { openDocument } from '../document'

import { importEmbeddedPage, pdfColorToHex, summarise } from './embedded'

import type { PdfjsAnnotationData } from '../../pdfjs/types'

const NOW = '2026-10-12T00:00:00.000Z'

async function rawAnnotations(name: Parameters<typeof fixtureBytes>[0]) {
  // PDF.js warns about Redact and about building FreeText appearances in Node; both expected.
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    verbosity: 0,
  })
  await doc.ready
  const page = await doc._pdfjs.getPage(0)
  const raw = (await page.getAnnotations()) as unknown as PdfjsAnnotationData[]
  return { doc, raw }
}

describe('embedded import', () => {
  it('converts colours', () => {
    expect(pdfColorToHex(new Uint8ClampedArray([255, 255, 0]), '#000000')).toBe('#FFFF00')
    expect(pdfColorToHex([0, 128, 0], '#000000')).toBe('#008000')
    expect(pdfColorToHex(null, '#123456')).toBe('#123456')
  })

  it('imports text markup with quads, author, contents and dates', async () => {
    const { doc, raw } = await rawAnnotations('annotated-markup')
    const { annotations, counts } = importEmbeddedPage(0, raw, NOW)
    expect(counts).toEqual({ Highlight: 1, Underline: 1, StrikeOut: 1, Squiggly: 1 })
    const hl = annotations.find((a) => a.type === 'highlight')
    expect(hl).toMatchObject({
      source: 'pdf',
      locked: true,
      author: 'Ed',
      contents: 'highlighted',
      color: '#FFFF00',
      opacity: 0.5,
      modifiedAt: '2026-10-12T12:00:00.000Z',
      createdAt: '2026-10-12T12:00:00.000Z',
      rect: { x: 72, y: 695, width: 328, height: 20 },
    })
    expect(hl!.id).toBe('pdf:0:7R')
    if (hl!.type === 'highlight') {
      expect(hl.quads[0]).toEqual({
        p1: { x: 72, y: 715 },
        p2: { x: 400, y: 715 },
        p3: { x: 72, y: 695 },
        p4: { x: 400, y: 695 },
      })
    }
    expect(annotations.map((a) => a.type).sort()).toEqual([
      'highlight',
      'squiggly',
      'strikeout',
      'underline',
    ])
    // No author or contents on the others: the keys are absent, not empty strings.
    const ul = annotations.find((a) => a.type === 'underline')!
    expect('author' in ul).toBe(false)
    expect('contents' in ul).toBe(false)
    expect(ul.createdAt).toBe(NOW)
    doc.destroy()
  })

  it('imports note threads with inReplyTo pointing at the imported id', async () => {
    const { doc, raw } = await rawAnnotations('annotated-notes-threaded')
    const { annotations } = importEmbeddedPage(0, raw, NOW)
    const root = annotations.find((a) => a.contents === 'Root note')!
    const replies = annotations.filter((a) => a.inReplyTo === root.id)
    expect(replies.map((r) => r.contents).sort()).toEqual(['First reply', 'Second reply'])
    expect(root.type === 'text' && root.icon).toBe('Comment')
    expect(root.createdAt).toBe('2026-10-12T11:00:00.000Z')
    expect(root.inReplyTo).toBeUndefined()
    // Ids are deterministic across opens.
    const again = importEmbeddedPage(0, raw, NOW).annotations.map((a) => a.id)
    expect(again).toEqual(annotations.map((a) => a.id))
    doc.destroy()
  })

  it('imports redactions as user marks', async () => {
    const red = await rawAnnotations('annotated-redact')
    const r = importEmbeddedPage(0, red.raw, NOW)
    expect(r.annotations).toHaveLength(2)
    expect(r.annotations.every((a) => a.type === 'redact' && a.origin === 'user')).toBe(
      true
    )
    expect(r.annotations[0]).toMatchObject({
      rect: { x: 72, y: 671, width: 228, height: 20 },
      interiorColor: '#000000',
      locked: true,
      source: 'pdf',
    })
    expect(r.counts).toEqual({ Redact: 2 })
    red.doc.destroy()
  })

  it('imports every shape subtype', async () => {
    const shapes = await rawAnnotations('annotated-shapes')
    const s = importEmbeddedPage(0, shapes.raw, NOW)
    expect(s.annotations.map((a) => a.type).sort()).toEqual([
      'circle',
      'freetext',
      'ink',
      'line',
      'polygon',
      'square',
    ])
    const by = (t: string) => s.annotations.find((a) => a.type === t)!
    expect(by('square')).toMatchObject({ width: 3, color: '#FF0000' })
    expect(by('line')).toMatchObject({
      start: { x: 72, y: 400 },
      end: { x: 400, y: 450 },
      width: 2,
    })
    expect(by('polygon')).toMatchObject({
      vertices: [
        { x: 72, y: 250 },
        { x: 300, y: 250 },
        { x: 186, y: 380 },
      ],
    })
    const ink = by('ink')
    if (ink.type === 'ink') {
      expect(ink.inklist).toHaveLength(1)
      expect(ink.inklist[0]).toHaveLength(5)
      expect(ink.inklist[0]![1]).toEqual({ x: 400, y: 380 })
    }
    // `/DA` carries the text colour and size; `/C` is the box's fill.
    expect(by('freetext')).toMatchObject({
      contents: 'Free text box',
      color: '#FFFFFF',
      defaultStyle: { fontSize: 12, color: '#000000' },
    })
    expect(by('freetext')).not.toHaveProperty('fontSize')
    shapes.doc.destroy()
  })

  it('counts unsupported subtypes without importing them', async () => {
    const red = await rawAnnotations('annotated-redact')
    const r = importEmbeddedPage(0, red.raw, NOW)
    const un = await rawAnnotations('annotated-unsupported')
    const u = importEmbeddedPage(0, un.raw, NOW)
    expect(u.annotations).toEqual([])
    expect(u.counts).toEqual({ Link: 1, Stamp: 1, FileAttachment: 1 })
    expect(summarise([u.counts, r.counts])).toEqual([
      { subtype: 'FileAttachment', count: 1, supported: false },
      { subtype: 'Link', count: 1, supported: false },
      { subtype: 'Redact', count: 2, supported: true },
      { subtype: 'Stamp', count: 1, supported: false },
    ])
    red.doc.destroy()
    un.doc.destroy()

    const form = await rawAnnotations('acroform-basic')
    const f = importEmbeddedPage(0, form.raw, NOW)
    expect(f.annotations).toEqual([])
    expect(f.counts.Widget).toBeGreaterThan(0)
    form.doc.destroy()
  })

  it('skips hidden or Popup annotations but still counts them', () => {
    const { annotations, counts } = importEmbeddedPage(
      0,
      [
        { id: '1R', subtype: 'Popup', annotationType: 16, rect: [0, 0, 1, 1] },
        {
          id: '2R',
          subtype: 'Square',
          annotationType: 5,
          rect: [0, 0, 1, 1],
          hidden: true,
        },
        {
          id: '3R',
          subtype: 'Square',
          annotationType: 5,
          rect: [0, 0, 1, 1],
          noView: true,
        },
      ],
      NOW
    )
    expect(annotations).toEqual([])
    expect(counts).toEqual({ Popup: 1, Square: 2 })
  })

  it('normalises a reversed rect', () => {
    const { annotations } = importEmbeddedPage(
      2,
      [{ id: '5R', subtype: 'Square', annotationType: 5, rect: [200, 300, 50, 100] }],
      NOW
    )
    expect(annotations[0]).toMatchObject({
      id: 'pdf:2:5R',
      page: 2,
      rect: { x: 50, y: 100, width: 150, height: 200 },
      color: '#C0392B',
      width: 1,
    })
  })
})

describe('embedded import of PDF names and callouts', () => {
  const at = (
    subtype: string,
    extra: Partial<PdfjsAnnotationData> = {}
  ): PdfjsAnnotationData => ({
    id: '9R',
    subtype,
    annotationType: 0,
    rect: [50, 500, 300, 700],
    ...extra,
  })
  const one = (d: PdfjsAnnotationData) => {
    const { annotations } = importEmbeddedPage(0, [d], NOW)
    expect(annotations).toHaveLength(1)
    return annotations[0]!
  }
  const quad = [72, 715, 400, 715, 72, 695, 400, 695]

  it.each([
    ['Highlight', { quadPoints: quad }, 'Custom'],
    ['Underline', { quadPoints: quad }, 'Custom'],
    ['StrikeOut', { quadPoints: quad }, 'Custom'],
    ['Squiggly', { quadPoints: quad }, 'Custom'],
    ['Text', { name: 'Comment' }, 'Custom'],
    ['FreeText', {}, 'FreeTextTypeWriter'],
    ['Square', {}, 'Custom'],
    ['Circle', {}, 'Custom'],
    ['Line', { lineCoordinates: [60, 520, 200, 600] }, 'LineArrow'],
    ['Polygon', { vertices: [0, 0, 10, 0, 5, 10] }, 'PolygonCloud'],
    ['PolyLine', { vertices: [0, 0, 10, 0, 5, 10] }, 'PolyLineDimension'],
    ['Ink', { inkLists: [[0, 0, 10, 10]] }, 'Custom'],
    ['Redact', {}, 'Custom'],
  ] satisfies [string, Partial<PdfjsAnnotationData>, string][])(
    'passes /IT through on %s',
    (subtype, extra, intent) => {
      expect(one(at(subtype, { ...extra, it: intent }))).toMatchObject({ intent })
    }
  )

  it('leaves intent out when there is no /IT', () => {
    expect(one(at('Square'))).not.toHaveProperty('intent')
  })

  it('imports note icons by their exact PDF name', () => {
    expect(one(at('Text', { name: 'Comment' }))).toMatchObject({ icon: 'Comment' })
    // A name Inkbar does not know is kept.
    expect(one(at('Text', { name: 'Check' }))).toMatchObject({ icon: 'Check' })
    // PDF names are case-sensitive: `/comment` is not `/Comment`.
    expect(one(at('Text', { name: 'comment' }))).toMatchObject({ icon: 'comment' })
  })

  it('imports a note with no /Name, or a NoIcon one, with the default icon', () => {
    // PDF.js reports `NoIcon` for any note with an appearance stream; it is never stored.
    expect(one(at('Text', { name: 'NoIcon' }))).toMatchObject({ icon: 'Note' })
    expect(one(at('Text'))).toMatchObject({ icon: 'Note' })
  })

  it('imports line endings as given', () => {
    expect(
      one(
        at('Line', {
          lineCoordinates: [60, 520, 200, 600],
          lineEndings: ['ROpenArrow', 'Slash'],
        })
      )
    ).toMatchObject({ head: 'ROpenArrow', tail: 'Slash' })
    // Unknown and differently cased names are kept, not matched to a known one.
    expect(
      one(
        at('Line', {
          lineCoordinates: [60, 520, 200, 600],
          lineEndings: ['openarrow', 'Wavy'],
        })
      )
    ).toMatchObject({ head: 'openarrow', tail: 'Wavy' })
  })

  it('imports polyline endings as lines do, and none on a polygon', () => {
    const vertices = [0, 0, 10, 0, 5, 10]
    expect(
      one(at('PolyLine', { vertices, lineEndings: ['OpenArrow', 'Wavy'] }))
    ).toMatchObject({ type: 'polyline', head: 'OpenArrow', tail: 'Wavy' })
    const plain = one(at('PolyLine', { vertices, lineEndings: ['None', 'None'] }))
    expect(plain).not.toHaveProperty('head')
    expect(plain).not.toHaveProperty('tail')
    const polygon = one(at('Polygon', { vertices, lineEndings: ['OpenArrow', 'None'] }))
    expect(polygon).not.toHaveProperty('head')
  })

  it('drops a name that is not a valid PDF name', () => {
    // `a b` holds whitespace, so it is not kept; the note takes the default icon.
    expect(one(at('Text', { name: 'a b' }))).toMatchObject({ icon: 'Note' })
    expect(one(at('Square', { it: 'a b' }))).not.toHaveProperty('intent')
    expect(
      one(
        at('Line', {
          lineCoordinates: [60, 520, 200, 600],
          lineEndings: ['a b', 'Slash'],
        })
      )
    ).toMatchObject({ head: 'None', tail: 'Slash' })
  })

  // PDF.js 6.4 passes FreeText /IT but not /CL, /RD or /LE, and has no other API that reads them.
  it.todo(
    'imports a FreeText callout line, fringe and head (PDF.js does not expose /CL /RD /LE)'
  )

  it('imports the standard callout fixture with its intent', async () => {
    const { doc, raw } = await rawAnnotations('standard-callout')
    const { annotations } = importEmbeddedPage(0, raw, NOW)
    expect(annotations).toHaveLength(1)
    expect(annotations[0]).toMatchObject({
      type: 'freetext',
      intent: 'FreeTextCallout',
      contents: 'Standard callout',
    })
    doc.destroy()
  })
})
