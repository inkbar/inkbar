import { describe, expect, it } from 'vitest'

import { en, resolveMessages, template } from '../messages'

import { findAnnouncer, findCountText } from './search/find-text'
import {
  colorMenuModel,
  highlightMenuModel,
  lineStyleMenuModel,
  shapeMenuModel,
  signatureMenuModel,
  textStyleMenuModel,
  threadDeleteLabel,
  threadPopoverLabel,
} from './ui'

import type { SearchState } from './search/controller'
import type { SearchHit } from '../model/search'

describe('models take messages', () => {
  it('shapeMenuModel names the menu and kinds from messages', () => {
    const m = resolveMessages({
      shape: { ellipse: 'Ellipse FR', current: template('fr', 'Forme : {kind}') },
    })
    const model = shapeMenuModel({ kind: 'ellipse' }, ['rectangle', 'ellipse'], m)
    expect(model.label).toBe('Forme : Ellipse FR')
    expect(model.items.map((i) => i.label)).toEqual(['Rectangle', 'Ellipse FR'])
    // English with `en`.
    expect(shapeMenuModel({ kind: 'ellipse' }, ['ellipse'], en).label).toBe(
      'Shape: Ellipse'
    )
  })

  it('highlightMenuModel', () => {
    const m = resolveMessages({ highlight: { underline: 'Souligner' } })
    const model = highlightMenuModel({ kind: 'underline' }, ['underline'], m)
    expect(model.label).toBe('Souligner')
    expect(model.items[0]!.label).toBe('Souligner')
  })

  it('lineStyleMenuModel', () => {
    const m = resolveMessages({
      lineStyle: { weight: 'Épaisseur', solid: 'Plein', arrowNone: 'Aucune' },
    })
    const model = lineStyleMenuModel({}, new Set(), m)
    expect(model.sections.map((s) => s.label)).toEqual([
      'Épaisseur',
      en.lineStyle.pattern,
      en.lineStyle.arrowheads,
    ])
    expect(model.sections[1]!.items[0]!.label).toBe('Plein')
    expect(model.sections[2]!.items[0]!.label).toBe('Aucune')
  })

  it('colorMenuModel', () => {
    const m = resolveMessages({ color: { fill: 'Remplissage' } })
    expect(colorMenuModel('fill', {}, new Set(), undefined, m).label).toBe('Remplissage')
  })

  it('textStyleMenuModel', () => {
    const m = resolveMessages({ textStyle: { label: 'Texte', bold: 'Gras' } })
    const model = textStyleMenuModel({}, new Set(), ['Helvetica'], m)
    expect(model.label).toBe('Texte')
    expect(model.toggles[0]!.label).toBe('Gras')
  })

  it('signatureMenuModel', () => {
    const m = resolveMessages({
      signature: { item: template('fr', 'Signature n° {n}') },
    })
    const t = { id: 'a', kind: 'drawn' } as never
    expect(signatureMenuModel([t], {}, m).items[0]!.label).toBe('Signature n° 1')
  })

  it('thread labels', () => {
    const m = resolveMessages({ notes: { noteThread: 'Fil', deleteHighlight: 'Suppr' } })
    expect(threadPopoverLabel({ type: 'text' }, m)).toBe('Fil')
    expect(threadDeleteLabel({ type: 'highlight' }, m)).toBe('Suppr')
  })
})

describe('find text takes messages', () => {
  const hit = { page: 1 } as SearchHit
  const state = (over: Partial<SearchState>): SearchState =>
    ({
      open: true,
      query: 'the',
      hits: [hit, hit],
      current: 0,
      scanning: false,
      ...over,
    }) as SearchState

  it('findCountText uses find.count', () => {
    const m = resolveMessages({
      find: { count: ({ current, total }) => `${current} sur ${total}` },
    })
    expect(findCountText(state({}), m)).toBe('1 sur 2')
    expect(findCountText(state({}), en)).toBe('1 of 2')
  })

  it('findAnnouncer uses find.announce', () => {
    const m = resolveMessages({
      find: { announce: ({ current, total, page }) => `${current}/${total} p${page}` },
    })
    expect(findAnnouncer(m)(state({}))).toBe('1/2 p2')
  })
})
