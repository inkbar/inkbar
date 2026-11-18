import { describe, expect, test } from 'vitest'

import { quadFromRect } from '../geometry'

import { planRedaction } from './plan'

import type { Annotation } from '../annotations/types'
import type { Rect } from '../geometry'

const base = {
  page: 0,
  color: '#F2C230',
  opacity: 1,
  createdAt: '2026-11-18T12:00:00.000Z',
  modifiedAt: '2026-11-18T12:00:00.000Z',
  source: 'session',
} as const

const area: Rect = { x: 100, y: 100, width: 100, height: 20 }

const mark = (id: string, rect: Rect = area, page = 0): Annotation => ({
  ...base,
  id,
  page,
  type: 'redact',
  rect,
  interiorColor: '#000000',
})

const highlight = (id: string, rect: Rect, page = 0): Annotation => ({
  ...base,
  id,
  page,
  type: 'highlight',
  rect,
  quads: [quadFromRect(rect)],
})

const note = (id: string, rect: Rect, inReplyTo?: string): Annotation => ({
  ...base,
  id,
  type: 'text',
  icon: 'Note',
  rect,
  ...(inReplyTo ? { inReplyTo } : {}),
})

const ids = (list: readonly Annotation[]) => list.map((a) => a.id)

describe('planRedaction', () => {
  test('removes a highlight under a mark', () => {
    const plan = planRedaction([
      mark('m'),
      highlight('h', { x: 150, y: 105, width: 100, height: 10 }),
    ])
    expect(ids(plan.removed)).toEqual(['h'])
    expect(ids(plan.kept)).toEqual([])
    expect(ids(plan.marks)).toEqual(['m'])
  })

  test('keeps one that only touches its edge', () => {
    const plan = planRedaction([
      mark('m'),
      highlight('right', { x: 200, y: 100, width: 50, height: 20 }),
      highlight('above', { x: 100, y: 120, width: 50, height: 20 }),
    ])
    expect(plan.removed).toEqual([])
    expect(ids(plan.kept)).toEqual(['right', 'above'])
  })

  test('keeps a mask whose bounds cover the page', () => {
    const mask: Annotation = {
      ...base,
      id: 'k',
      type: 'mask',
      rect: { x: 0, y: 0, width: 612, height: 792 },
      shape: 'rect',
      dim: 0.5,
    }
    const plan = planRedaction([mark('m'), mask])
    expect(plan.removed).toEqual([])
    expect(ids(plan.kept)).toEqual(['k'])
  })

  test('removes replies with their note', () => {
    const plan = planRedaction([
      mark('m'),
      note('n', { x: 120, y: 100, width: 20, height: 20 }),
      note('r1', { x: 0, y: 700, width: 20, height: 20 }, 'n'),
      note('r2', { x: 0, y: 700, width: 20, height: 20 }, 'r1'),
      note('far', { x: 400, y: 400, width: 20, height: 20 }),
      note('far-reply', { x: 150, y: 100, width: 20, height: 20 }, 'far'),
    ])
    expect(ids(plan.removed)).toEqual(['n', 'r1', 'r2'])
    expect(ids(plan.kept)).toEqual(['far', 'far-reply'])
  })

  test('removes a loupe whose lens meets a mark and keeps one elsewhere on the page', () => {
    const loupe = (id: string, rect: Rect): Annotation => ({
      ...base,
      id,
      type: 'loupe',
      rect,
      magnification: 2,
      width: 2,
    })
    const plan = planRedaction([
      mark('m'),
      loupe('near', { x: 180, y: 90, width: 60, height: 60 }),
      loupe('away', { x: 300, y: 300, width: 60, height: 60 }),
    ])
    expect(ids(plan.removed)).toEqual(['near'])
    expect(ids(plan.kept)).toEqual(['away'])
  })

  test('removes a signature pinned to a field a mark covers', () => {
    const stamp = (id: string, rect: Rect): Annotation => ({
      ...base,
      id,
      type: 'stamp',
      rect,
      subject: 'Signature',
      imagedata: 'data:image/png;base64,AAAA',
    })
    const plan = planRedaction(
      [
        mark('m'),
        stamp('sig', { x: 400, y: 400, width: 40, height: 20 }),
        stamp('other', { x: 400, y: 300, width: 40, height: 20 }),
      ],
      {
        fieldRects: new Map([
          ['sig', { page: 0, rect: { x: 150, y: 90, width: 100, height: 40 } }],
          ['other', { page: 1, rect: { x: 150, y: 90, width: 100, height: 40 } }],
        ]),
      }
    )
    expect(ids(plan.removed)).toEqual(['sig'])
    expect(ids(plan.kept)).toEqual(['other'])
  })

  test('ignores locked file annotations', () => {
    const embedded: Annotation = {
      ...highlight('h', area),
      source: 'pdf',
      locked: true,
    }
    const plan = planRedaction([mark('m'), embedded])
    expect(plan.removed).toEqual([])
    expect(plan.kept).toEqual([])
  })

  test('gives an area mark quads from its rect', () => {
    const plan = planRedaction([mark('m')])
    expect(plan.regions).toEqual([{ page: 0, quads: [quadFromRect(area)] }])
  })

  test('takes a text mark quads as they are', () => {
    const quads = [
      quadFromRect({ x: 10, y: 10, width: 50, height: 10 }),
      quadFromRect({ x: 10, y: 30, width: 50, height: 10 }),
    ]
    const text: Annotation = {
      ...mark('t', { x: 10, y: 10, width: 50, height: 30 }),
      quads,
    } as Annotation
    expect(planRedaction([text]).regions[0]?.quads).toEqual(quads)
  })

  test('counts pages', () => {
    const plan = planRedaction([mark('a'), mark('b', area, 0), mark('c', area, 2)])
    expect(plan.pages).toBe(2)
    expect(plan.regions.map((r) => r.page)).toEqual([0, 0, 2])
    expect(planRedaction([]).pages).toBe(0)
  })

  describe('replies to file notes', () => {
    const fileNote = (rect: Rect): Annotation => ({
      ...note('fn', rect),
      source: 'pdf',
      locked: true,
    })

    test('removes a reply to a locked file note under a mark', () => {
      const plan = planRedaction([
        mark('m'),
        fileNote({ x: 120, y: 100, width: 20, height: 20 }),
        note('r', { x: 400, y: 400, width: 20, height: 20 }, 'fn'),
      ])
      expect(ids(plan.removed)).toEqual(['r'])
      expect(plan.kept).toEqual([])
    })

    test('keeps a reply to a file note elsewhere, even with its own rect under a mark', () => {
      const plan = planRedaction([
        mark('m'),
        fileNote({ x: 400, y: 400, width: 20, height: 20 }),
        note('r', { x: 120, y: 100, width: 20, height: 20 }, 'fn'),
      ])
      expect(plan.removed).toEqual([])
      expect(ids(plan.kept)).toEqual(['r'])
    })

    test('keeps an orphan reply under a mark', () => {
      const plan = planRedaction([
        mark('m'),
        note('r', { x: 120, y: 100, width: 20, height: 20 }, 'gone'),
      ])
      expect(plan.removed).toEqual([])
      expect(ids(plan.kept)).toEqual(['r'])
    })
  })
})
