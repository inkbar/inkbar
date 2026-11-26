import { describe, expect, it } from 'vitest'

import { fieldAnnotations, fieldPlaces, fieldRegion } from './fields-draw'

import type { AnnotationFactsShape, FieldFactsShape, FormFactsShape } from './types'
import type { PageInfo } from '../model/pages'

/** A widget of page 0 at `index` in `/Annots`, object `index + 10` unless given. */
const widget = (
  index: number,
  over: Partial<AnnotationFactsShape> = {}
): AnnotationFactsShape => ({
  index,
  subtype: 'Widget',
  objectNumber: index + 10,
  generation: 0,
  rect: [0, 0, 10, 10],
  rectOk: true,
  flags: 4,
  hasAppearance: true,
  appearanceStates: [],
  ...over,
})

/** A field of `kind` whose widgets are page 0's annotations `widgets`. */
const field = (
  kind: FieldFactsShape['kind'],
  widgets: AnnotationFactsShape[],
  over: Partial<FieldFactsShape> = {}
): FieldFactsShape => ({
  name: kind,
  origin: 'acroform',
  kind,
  flags: 0,
  valueKind: 'none',
  defaultValueKind: 'none',
  widgets: widgets.map((w) => ({
    ...w,
    page: 0,
    scripts: {},
    ...(w.appearanceStates.some((s) => s !== 'Off')
      ? { onState: w.appearanceStates.find((s) => s !== 'Off')! }
      : {}),
  })),
  ...over,
})

const form = (fields: FieldFactsShape[]): FormFactsShape => ({
  kind: 'acroform',
  needAppearances: false,
  fields,
  groups: [],
  fieldsRoot: [],
  calculationOrderRefs: [],
  tooLarge: false,
  truncated: false,
})

describe('fieldPlaces', () => {
  it('lists the widgets the page shows by id, with each toggle’s on-state', () => {
    const text = widget(0)
    const box = widget(1, { appearanceStates: ['Off', 'Yes'], appearanceState: 'Off' })
    const radio = widget(2, { appearanceStates: ['Off', 'b'], appearanceState: 'b' })
    const square = { ...widget(3), subtype: 'Square' }
    const noView = widget(4, { flags: 32 })
    const hidden = widget(5, { flags: 2 })
    // Written as a direct object: no object number.
    const direct = widget(6)
    delete direct.objectNumber
    delete direct.generation
    const places = fieldPlaces(
      0,
      {
        annotations: [text, box, radio, square, noView, hidden, direct],
        truncated: false,
      },
      form([field('text', [text]), field('checkbox', [box]), field('radio', [radio])])
    )
    expect([...places]).toEqual([
      ['10R', [{ index: 0, states: [] }]],
      ['11R', [{ index: 1, states: ['Off', 'Yes'], toggle: { onState: 'Yes' } }]],
      ['12R', [{ index: 2, states: ['Off', 'b'], toggle: { onState: 'b' } }]],
      ['p0i6', [{ index: 6, states: [] }]],
    ])
  })

  it('picks a checkbox’s on-state as PDF.js does, from its states and the value', () => {
    // Two on-states: the one the file selects is the one drawn for checked.
    const box = widget(0, {
      appearanceStates: ['A', 'B', 'Off'],
      appearanceState: 'B',
    })
    const places = fieldPlaces(
      0,
      { annotations: [box], truncated: false },
      form([field('checkbox', [box])])
    )
    expect(places.get('10R')![0]!.toggle).toEqual({ onState: 'B' })
  })

  it('keeps each place of a widget `/Annots` lists twice', () => {
    const w = widget(0)
    const places = fieldPlaces(
      0,
      { annotations: [w, { ...w, index: 3 }], truncated: false },
      undefined
    )
    expect(places.get('10R')!.map((p) => p.index)).toEqual([0, 3])
  })
})

describe('fieldAnnotations', () => {
  const text = widget(0)
  const box = widget(1, { appearanceStates: ['Off', 'Yes No'] })
  const onOnly = widget(2, { appearanceStates: ['Yes'] })
  const radio = widget(3, { appearanceStates: ['Off'] })
  const places = fieldPlaces(
    0,
    { annotations: [text, box, onOnly, radio], truncated: false },
    form([
      field('text', [text]),
      field('checkbox', [box]),
      { ...field('checkbox', [onOnly]), name: 'other' },
      field('radio', [radio]),
    ])
  )
  const ids = ['13R', '12R', '11R', '10R', 'missing']

  it('draws the state /AS selects for own, in /Annots order', () => {
    expect(fieldAnnotations(places, ids, 'own')).toEqual({
      annotations: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }],
      idAt: new Map([
        [3, '13R'],
        [2, '12R'],
        [1, '11R'],
        [0, '10R'],
      ]),
    })
  })

  it('draws a toggle’s on-state for checked, and nothing of one without it', () => {
    // The radio has no on-state; the text field is no toggle.
    expect(fieldAnnotations(places, ids, 'checked').annotations).toEqual([
      { index: 1, state: 'Yes No' },
      { index: 2, state: 'Yes' },
    ])
  })

  it('draws Off for unchecked, and nothing of a toggle without it', () => {
    expect(fieldAnnotations(places, ids, 'unchecked').annotations).toEqual([
      { index: 1, state: 'Off' },
      { index: 3, state: 'Off' },
    ])
  })
})

describe('fieldRegion', () => {
  const page: PageInfo = {
    index: 0,
    box: { x: 0, y: 0, width: 612, height: 792 },
    rotate: 0,
    userUnit: 1,
    width: 612,
    height: 792,
  }

  it('maps the canvas’s device pixels back to user space', () => {
    const request = { zoom: 2, rotation: 0 as const, pixelRatio: 1, x: 100, y: 200 }
    expect(fieldRegion(page, request, 40, 20)).toEqual({
      x: 50,
      y: 682,
      width: 20,
      height: 10,
    })
  })

  it('turns with the page', () => {
    const request = { zoom: 1, rotation: 90 as const, pixelRatio: 2, x: 0, y: 0 }
    // Turned a quarter clockwise, the canvas's top-left corner is the page's bottom-left.
    expect(fieldRegion(page, request, 20, 10)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 10,
    })
  })

  it('follows the page canvas’s whole pixels, not the zoom alone', () => {
    // 612 × 1.001 = 612.612 CSS px across, drawn on 613 device pixels.
    const request = { zoom: 1.001, rotation: 0 as const, pixelRatio: 1, x: 613, y: 0 }
    const region = fieldRegion(page, request, 1, 1)!
    // The page's last pixel ends at its right edge; at the zoom alone it would end 0.4 pt past it.
    expect(region.x).toBeCloseTo(612, 9)
  })
})
