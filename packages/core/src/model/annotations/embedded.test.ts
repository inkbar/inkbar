import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { openDocument } from '../document'

import { importEmbeddedPage, pdfColorToHex, summarise } from './embedded'

import type { PdfjsAnnotationData } from '../../pdfjs/types'

const NOW = '2026-10-12T00:00:00.000Z'

async function rawAnnotations(name: Parameters<typeof fixtureBytes>[0]) {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
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
      expect(hl!.quads[0]).toEqual({
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
    expect(root.type === 'note' && root.icon).toBe('comment')
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
      fill: '#000000',
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
      'freeText',
      'ink',
      'line',
      'polygon',
      'square',
    ])
    const by = (t: string) => s.annotations.find((a) => a.type === t)!
    expect(by('square')).toMatchObject({ strokeWidth: 3, color: '#FF0000' })
    expect(by('line')).toMatchObject({
      start: { x: 72, y: 400 },
      end: { x: 400, y: 450 },
      strokeWidth: 2,
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
      expect(ink.paths).toHaveLength(1)
      expect(ink.paths[0]).toHaveLength(5)
      expect(ink.paths[0]![1]).toEqual({ x: 400, y: 380 })
    }
    expect(by('freeText')).toMatchObject({
      text: 'Free text box',
      fontSize: 12,
      color: '#000000',
    })
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
      strokeWidth: 1,
    })
  })
})
