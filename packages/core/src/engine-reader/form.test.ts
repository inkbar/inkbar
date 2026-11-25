import { describe, expect, it } from 'vitest'

import { fileFieldsFromEngine, widgetContexts } from './form'

import type { FieldFactsShape, FormFactsShape, WidgetFactsShape } from './types'
import type { FileAnnotation } from '../reader/file'

/** A widget on page 0 at /Annots index `index`, object 20 + index, unless told otherwise. */
const widget = (
  index: number,
  over: Partial<WidgetFactsShape> = {}
): WidgetFactsShape => ({
  page: 0,
  index,
  objectNumber: 20 + index,
  generation: 0,
  rect: [10, 10, 50, 30],
  rectOk: true,
  flags: 4,
  hasAppearance: true,
  appearanceStates: [],
  scripts: {},
  ...over,
})

const field = (
  name: string,
  widgets: WidgetFactsShape[],
  over: Partial<FieldFactsShape> = {}
): FieldFactsShape => ({
  name,
  kind: 'text',
  flags: 0,
  valueKind: 'none',
  defaultValueKind: 'none',
  widgets,
  ...over,
})

const form = (
  fields: FieldFactsShape[],
  over: Partial<FormFactsShape> = {}
): FormFactsShape => ({
  kind: 'acroform',
  needAppearances: false,
  fields,
  tooLarge: false,
  truncated: false,
  ...over,
})

/** A page's listed annotations: one per id, in the order given. */
const listedAs =
  (pages: Record<number, string[]>) =>
  (page: number): Promise<FileAnnotation[]> =>
    Promise.resolve(
      (pages[page] ?? []).map((id) => ({
        id,
        subtype: 'Widget',
        rect: [0, 0, 0, 0] as [number, number, number, number],
        hasAppearance: false,
      }))
    )

describe('fileFieldsFromEngine', () => {
  it("places a widget by its position among the page's listed annotations, not its /Annots index", async () => {
    // /Annots: a Square (10R) at 0, the widget at 1; PDF.js lists a link 12R before it.
    const fields = await fileFieldsFromEngine(
      form([field('name', [widget(1)])]),
      listedAs({ 0: ['10R', '12R', '21R'] })
    )
    expect(fields[0]!.widgets[0]).toMatchObject({ id: '21R', page: 0, at: 2 })
  })

  it('leaves out a field with no widget, a widget on no page, and a field of a kind PDF.js does not read', async () => {
    const fields = await fileFieldsFromEngine(
      form([
        field('lonely', []),
        field('nowhere', [widget(-1, { page: -1 })]),
        field('odd', [widget(2)], { kind: 'unknown' }),
        field('name', [widget(1)]),
      ]),
      listedAs({ 0: ['21R', '22R'] })
    )
    expect(fields.map((f) => f.name)).toEqual(['name'])
  })

  it('orders fields by their first widgets and widgets by page and place', async () => {
    const fields = await fileFieldsFromEngine(
      form([field('b', [widget(0, { page: 1 }), widget(1)]), field('a', [widget(2)])]),
      listedAs({ 0: ['22R', '21R'], 1: ['20R'] })
    )
    expect(fields.map((f) => [f.name, f.widgets.map((w) => [w.page, w.at])])).toEqual([
      ['a', [[0, 0]]],
      [
        'b',
        [
          [0, 1],
          [1, 0],
        ],
      ],
    ])
  })

  it("gives a checkbox's on value from its export value, else its on-state", async () => {
    const fields = await fileFieldsFromEngine(
      form([
        field(
          'agree',
          [
            widget(0, {
              appearanceStates: ['Off', 'Yes'],
              onState: 'Yes',
              exportValue: 'I agree',
              appearanceState: 'Yes',
            }),
            widget(1, { appearanceStates: ['Off', 'On'], onState: 'On' }),
          ],
          { kind: 'checkbox', valueKind: 'name', value: 'Yes' }
        ),
      ]),
      listedAs({ 0: ['20R', '21R'] })
    )
    expect(fields[0]).toMatchObject({ value: 'I agree', defaultValue: 'Off' })
    expect(fields[0]!.widgets.map((w) => w.onValue)).toEqual(['I agree', 'On'])
  })

  it("maps a radio's value through the widget whose on-state it names", async () => {
    const fields = await fileFieldsFromEngine(
      form([
        field(
          'size',
          [
            widget(0, {
              appearanceStates: ['Off', 'S'],
              onState: 'S',
              exportValue: 'Small',
            }),
            widget(1, {
              appearanceStates: ['L', 'Off'],
              onState: 'L',
              exportValue: 'Large',
            }),
          ],
          { kind: 'radio', flags: 1 << 15, valueKind: 'name', value: 'L' }
        ),
      ]),
      listedAs({ 0: ['20R', '21R'] })
    )
    expect(fields[0]).toMatchObject({ value: 'Large', defaultValue: 'Off' })
    expect(fields[0]!.widgets.map((w) => w.onValue)).toEqual(['Small', 'Large'])
  })

  it('reads a text field as PDF.js does: empty value, maximum length 0, /DV when /V is absent', async () => {
    const [plain, defaulted] = await fileFieldsFromEngine(
      form([
        field('plain', [widget(0)]),
        field('defaulted', [widget(1)], {
          defaultValueKind: 'string',
          defaultValue: 'x',
        }),
      ]),
      listedAs({ 0: ['20R', '21R'] })
    )
    expect(plain).toMatchObject({ value: '', maxLength: 0 })
    expect(plain).not.toHaveProperty('defaultValue')
    expect(defaulted).toMatchObject({ value: 'x', defaultValue: 'x' })
  })

  it('converts /MK colours as PDF.js does: five components give none', async () => {
    const [f] = await fileFieldsFromEngine(
      form([
        field('name', [
          widget(0, { borderColor: [1, 0, 0, 0, 0], backgroundColor: [1] }),
        ]),
      ]),
      listedAs({ 0: ['20R'] })
    )
    expect(f!.widgets[0]).not.toHaveProperty('borderColor')
    expect(f!.widgets[0]!.backgroundColor).toEqual([255, 255, 255])
  })

  it("names each script by PDF.js's event name and drops other keys, __proto__ included", async () => {
    const [f] = await fileFieldsFromEngine(
      form([
        field('name', [
          widget(0, {
            scripts: { A: ['a()'], K: ['k()'], Fo: ['f()'], Zz: ['z()'] },
          }),
        ]),
      ]),
      listedAs({ 0: ['20R'] })
    )
    expect(f!.widgets[0]!.actions).toEqual({
      scripts: { Action: ['a()'], Keystroke: ['k()'], Focus: ['f()'] },
    })
    const scripts = JSON.parse('{"__proto__": ["p()"], "K": ["k()"]}') as Record<
      string,
      string[]
    >
    // Not an event PDF.js names: dropped, and nothing is set on the prototype.
    const [g] = await fileFieldsFromEngine(
      form([field('name', [widget(0, { scripts })])]),
      listedAs({ 0: ['20R'] })
    )
    expect(g!.widgets[0]!.actions.scripts).toEqual({ Keystroke: ['k()'] })
    expect(Object.getPrototypeOf(g!.widgets[0]!.actions.scripts)).toBe(Object.prototype)
  })

  it("gives a push button's ResetForm, a reference to a left-out widget as its field's name", async () => {
    const [button] = await fileFieldsFromEngine(
      form([
        field(
          'reset',
          [
            widget(0, {
              action: {
                kind: 'ResetForm',
                reset: {
                  fields: ['a'],
                  refs: [
                    { objectNumber: 21, generation: 0 },
                    { objectNumber: 30, generation: 2 },
                  ],
                  flags: 0,
                },
              },
            }),
          ],
          { kind: 'button', flags: 1 << 16 }
        ),
        field('odd', [widget(1)], { kind: 'unknown' }),
      ]),
      listedAs({ 0: ['20R', '21R'] })
    )
    expect(button!.widgets[0]!.actions.resetForm).toEqual({
      fields: ['a', 'odd'],
      refs: ['30R2'],
      include: true,
    })
  })

  it('counts an appearance for a widget whose field has a value when /NeedAppearances is set', async () => {
    const [f] = await fileFieldsFromEngine(
      form(
        [
          field('name', [widget(0, { hasAppearance: false })], {
            valueKind: 'string',
            value: 'v',
          }),
        ],
        { needAppearances: true }
      ),
      listedAs({ 0: ['20R'] })
    )
    expect(f!.widgets[0]!.hasAppearance).toBe(true)
  })

  it("takes a widget's /DA from the form when it has none, and hides a text widget with /PMD", async () => {
    const [f] = await fileFieldsFromEngine(
      form([field('code', [widget(0, { paperMetadata: true, alignment: 7 })])], {
        defaultAppearance: '/Helv 9 Tf 1 0 0 rg',
        alignment: 2,
      }),
      listedAs({ 0: ['20R'] })
    )
    expect(f!.widgets[0]).toMatchObject({
      flags: 4 | 2,
      alignment: 2,
      defaultAppearance: { fontName: 'Helv', fontSize: 9, color: [255, 0, 0] },
    })
  })

  it('gives a widget /Annots lists twice a widget for each place, as PDF.js does', async () => {
    const [f] = await fileFieldsFromEngine(
      form([field('name', [widget(0)])]),
      listedAs({ 0: ['20R', '20R'] })
    )
    expect(f!.widgets.map((w) => [w.id, w.at])).toEqual([
      ['20R', 0],
      ['20R', 1],
    ])
  })

  it("takes a widget's /DA from the form when its own is empty", async () => {
    const [f] = await fileFieldsFromEngine(
      form([field('name', [widget(0, { defaultAppearance: '' })])], {
        defaultAppearance: '/Helv 9 Tf',
      }),
      listedAs({ 0: ['20R'] })
    )
    expect(f!.widgets[0]!.defaultAppearance).toMatchObject({
      fontName: 'Helv',
      fontSize: 9,
    })
  })
})

describe('widgetContexts', () => {
  it("gives each page's widgets their /DA and whether their field's value counts as an appearance", () => {
    const contexts = widgetContexts(
      form(
        [
          field('a', [widget(0, { defaultAppearance: '/Cour 8 Tf' })], {
            valueKind: 'string',
            value: 'v',
          }),
          field('b', [widget(3, { page: 2 })]),
        ],
        { needAppearances: true, defaultAppearance: '/Helv 0 Tf' }
      )
    )
    expect(contexts.get(0)!.widgets.get(0)).toEqual({
      defaultAppearance: '/Cour 8 Tf',
      drawnFromValue: true,
    })
    expect(contexts.get(2)!.widgets.get(3)).toEqual({
      defaultAppearance: '/Helv 0 Tf',
      drawnFromValue: false,
    })
  })
})
