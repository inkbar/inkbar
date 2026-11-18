import { describe, expect, test, vi } from 'vitest'

import { COURIER_ADVANCE } from '../text/measure'

import { num } from './operators'
import { paintDrawing, UnpaintableError, type TextPicture } from './paint'
import { winAnsi } from './win-ansi'

import type { Rect } from '../../../geometry'
import type { DrawItem, Drawing, TextFont, TextLine } from '../types'

type TextItem = Extract<DrawItem, { kind: 'text' }>

const bounds = { x: 0, y: 0, width: 200, height: 800 }
const drawing = (...items: DrawItem[]): Drawing => ({
  layer: 'annotation',
  bounds,
  items,
})
const decode = (a: { content: Uint8Array }): string => new TextDecoder().decode(a.content)
const helvetica: TextFont = { family: 'Helvetica', bold: false, italic: false }

const line = (
  text: string,
  x: number,
  y: number,
  extra: Partial<TextLine> = {}
): TextLine => ({ text, origin: { x, y }, width: 30, outside: false, ...extra })

const textItem = (lines: TextLine[], over: Partial<TextItem> = {}): TextItem => ({
  kind: 'text',
  lines,
  font: helvetica,
  size: 12,
  color: '#000000',
  angle: 0,
  outsideStandardFonts: false,
  ...over,
})

const paintOf = async (
  items: DrawItem[],
  helpers: Parameters<typeof paintDrawing>[1] = { page: 0 }
) => {
  const a = await paintDrawing(drawing(...items), helpers)
  return { a, content: decode(a) }
}

/** A run as written: font, colour, position, then any spacing, the string and its end. */
const run = (position: string, body: string, font = '/F0 12 Tf'): string =>
  `BT\n${font}\n0 0 0 rg\n${position}\n${body} Tj\nET`

describe('standard-font text', () => {
  test('one Helvetica line is set at its origin', async () => {
    const { a, content } = await paintOf([textItem([line('Hello', 10, 700)])])
    expect(content).toBe(`q\n${run('10 700 Td', '(Hello)')}\nQ`)
    expect(a.fonts).toEqual({ F0: 'Helvetica' })
    expect(a.images).toBeUndefined()
  })

  test('each face has its standard font name, and equal fonts share a name', async () => {
    const face = (family: TextFont['family'], bold: boolean, italic: boolean) =>
      textItem([line('a', 0, 0)], { font: { family, bold, italic } })
    const { a } = await paintOf([
      face('Helvetica', false, false),
      face('Helvetica', true, true),
      face('Times', false, false),
      face('Times', true, true),
      face('Times', false, true),
      face('Courier', true, false),
      face('Courier', false, true),
      face('Helvetica', false, false),
    ])
    expect(a.fonts).toEqual({
      F0: 'Helvetica',
      F1: 'Helvetica-BoldOblique',
      F2: 'Times-Roman',
      F3: 'Times-BoldItalic',
      F4: 'Times-Italic',
      F5: 'Courier-Bold',
      F6: 'Courier-Oblique',
    })
  })

  test('a justified line sets its word spacing, and the next line clears it', async () => {
    const { content } = await paintOf([
      textItem([line('a b', 10, 700, { wordSpacing: 1.5 }), line('c d', 10, 686)]),
    ])
    expect(content).toBe(
      `q\n${run('10 700 Td\n1.5 Tw', '(a b)')}\n${run('10 686 Td\n0 Tw', '(c d)')}\nQ`
    )
  })

  test('a line with segments is set one segment at a time, at their origins', async () => {
    const { content } = await paintOf([
      textItem([
        line('a\tb', 10, 700, {
          segments: [
            { text: 'a', origin: { x: 10, y: 700 }, width: 6, outside: false },
            { text: 'b', origin: { x: 50, y: 700 }, width: 6, outside: false },
          ],
        }),
      ]),
    ])
    expect(content).toBe(`q\n${run('10 700 Td', '(a)')}\n${run('50 700 Td', '(b)')}\nQ`)
  })

  test('Courier is spaced out to the advance the layout uses', async () => {
    const tc = num((1229 / 2048 - 0.6) * 10)
    expect(tc).toBe(num((COURIER_ADVANCE - 0.6) * 10))
    const { a, content } = await paintOf([
      textItem([line('abc', 10, 700)], {
        font: { family: 'Courier', bold: false, italic: false },
        size: 10,
      }),
    ])
    expect(content).toBe(`q\n${run(`10 700 Td\n${tc} Tc`, '(abc)', '/F0 10 Tf')}\nQ`)
    expect(a.fonts).toEqual({ F0: 'Courier' })
  })

  test('an underline is a filled rectangle centred on the rule', async () => {
    const { content } = await paintOf([
      textItem([
        line('Hi', 10, 700, {
          underline: {
            from: { x: 10, y: 698.8 },
            to: { x: 40, y: 698.8 },
            thickness: 0.6,
          },
        }),
      ]),
    ])
    expect(content).toBe(
      `q\n${run('10 700 Td', '(Hi)')}\n0 0 0 rg\n10 698.5 30 0.6 re\nf\nQ`
    )
  })

  test('a turned underline runs along its rule', async () => {
    const { content } = await paintOf([
      textItem(
        [
          line('Hi', 10, 700, {
            underline: {
              from: { x: 11.2, y: 700 },
              to: { x: 11.2, y: 730 },
              thickness: 0.6,
            },
          }),
        ],
        { angle: 90 }
      ),
    ])
    expect(content).toContain('\n0 0 0 rg\n10.9 700 0.6 30 re\nf\nQ')
  })

  test('angle 90 turns each run anticlockwise about its origin', async () => {
    const { content } = await paintOf([
      textItem([line('Up', 10, 700), line('Up', 24, 700)], { angle: 90 }),
    ])
    expect(content).toBe(
      `q\n${run('0 1 -1 0 10 700 Tm', '(Up)')}\n${run('0 1 -1 0 24 700 Tm', '(Up)')}\nQ`
    )
    const half = await paintOf([textItem([line('Up', 10, 700)], { angle: 180 })])
    expect(half.content).toContain('\n-1 0 0 -1 10 700 Tm\n')
    const three = await paintOf([textItem([line('Up', 10, 700)], { angle: 270 })])
    expect(three.content).toContain('\n0 -1 1 0 10 700 Tm\n')
  })

  test('a clip with a radius is a rounded rect set as the clip before the text', async () => {
    const rect: Rect = { x: 0, y: 650, width: 100, height: 60 }
    const shape = await paintOf([
      { kind: 'rect', rect, radius: 5, paint: { fill: { color: '#000000' } } },
    ])
    const path = shape.content.split('\n').slice(2, -2).join('\n')
    expect(path.startsWith('5 710 m\n')).toBe(true)
    const { content } = await paintOf([
      textItem([line('Hello', 10, 700)], { clip: { rect, radius: 5 } }),
    ])
    expect(content).toBe(`q\n${path}\nW n\n${run('10 700 Td', '(Hello)')}\nQ`)
  })

  test('a line with no text writes no run', async () => {
    const { content } = await paintOf([textItem([line('', 10, 700)])])
    expect(content).toBe('')
  })

  test('text with parentheses and a backslash round-trips', async () => {
    const input = 'Total (net) \\ 5'
    const { content } = await paintOf([textItem([line(input, 10, 700)])])
    const written = /\n\((.*)\) Tj\n/.exec(content)![1]!
    expect(written).toBe('Total \\(net\\) \\\\ 5')
    const bytes: number[] = []
    for (let i = 0; i < written.length; i++) {
      const c = written[i]!
      if (c !== '\\') {
        bytes.push(c.charCodeAt(0))
        continue
      }
      const next = written[++i]!
      if (/[0-7]/.test(next)) {
        bytes.push(parseInt(written.slice(i, i + 3), 8))
        i += 2
      } else bytes.push(next.charCodeAt(0))
    }
    expect(bytes).toEqual([...winAnsi(input)!])
    expect(new TextDecoder('latin1').decode(new Uint8Array(bytes))).toBe(input)
  })

  test('a soft hyphen, which the screen does not draw within a line, is left out', async () => {
    const shy = String.fromCharCode(0xad)
    const { content } = await paintOf([textItem([line(`co${shy}op${shy}`, 10, 700)])])
    expect(content).toBe(`q\n${run('10 700 Td', '(coop)')}\nQ`)
    const alone = await paintOf([textItem([line(shy, 10, 700)])])
    expect(alone.content).toBe('')
  })

  test('an accent written as a separate mark is set as the composed letter', async () => {
    const { content } = await paintOf([textItem([line('é', 10, 700)])])
    expect(content).toBe(`q\n${run('10 700 Td', '(\\351)')}\nQ`)
  })
})

describe('text painted as a picture', () => {
  const png = new Uint8Array([1, 2, 3])
  const picture = () =>
    vi.fn<TextPicture>(() => Promise.resolve({ png, width: 20, ascent: 9, descent: 3 }))

  test('a line outside the standard fonts is a picture at its origin', async () => {
    const textPicture = picture()
    const { a, content } = await paintOf(
      [textItem([line('日本', 10, 700, { outside: true })])],
      {
        page: 0,
        textPicture,
      }
    )
    expect(textPicture.mock.calls).toEqual([
      [{ text: '日本', font: helvetica, size: 12, color: '#000000' }],
    ])
    expect(a.images).toEqual({ Im0: { format: 'png', data: png } })
    expect(a.fonts).toBeUndefined()
    expect(content).not.toContain('Tj')
    // 20 wide from the origin, from 3 below the baseline to 9 above it.
    expect(content).toBe('q\nq\n20 0 0 12 10 697 cm\n/Im0 Do\nQ\nQ')
  })

  test('a picture turns with the item about the run origin', async () => {
    const { content } = await paintOf(
      [textItem([line('日本', 10, 700, { outside: true })], { angle: 90 })],
      { page: 0, textPicture: picture() }
    )
    expect(content).toBe('q\nq\n0 20 -12 0 13 700 cm\n/Im0 Do\nQ\nQ')
  })

  test('a line Windows ANSI cannot encode is a picture too', async () => {
    const textPicture = picture()
    const { content } = await paintOf([textItem([line('Ǆ', 10, 700)])], {
      page: 0,
      textPicture,
    })
    expect(textPicture).toHaveBeenCalledTimes(1)
    expect(content).not.toContain('Tj')
  })

  test('only the outside segment of a line is a picture', async () => {
    const textPicture = picture()
    const { a, content } = await paintOf(
      [
        textItem([
          line('ab\t日', 10, 700, {
            outside: true,
            segments: [
              { text: 'ab', origin: { x: 10, y: 700 }, width: 12, outside: false },
              { text: '日', origin: { x: 50, y: 700 }, width: 12, outside: true },
            ],
          }),
        ]),
      ],
      { page: 0, textPicture }
    )
    expect(textPicture.mock.calls).toEqual([
      [{ text: '日', font: helvetica, size: 12, color: '#000000' }],
    ])
    expect(content).toBe(
      `q\n${run('10 700 Td', '(ab)')}\nq\n20 0 0 12 50 697 cm\n/Im0 Do\nQ\nQ`
    )
    expect(a.fonts).toEqual({ F0: 'Helvetica' })
  })

  test('a justified line asks for its word spacing in the picture', async () => {
    const textPicture = picture()
    await paintOf(
      [
        textItem([
          line('日 本', 10, 700, { outside: true, wordSpacing: 1.5 }),
          line('日 本', 10, 686, { outside: true }),
        ]),
      ],
      { page: 0, textPicture }
    )
    expect(textPicture.mock.calls).toEqual([
      [{ text: '日 本', font: helvetica, size: 12, color: '#000000', wordSpacing: 1.5 }],
      [{ text: '日 本', font: helvetica, size: 12, color: '#000000' }],
    ])
    expect(textPicture.mock.calls[1]![0]).not.toHaveProperty('wordSpacing')
  })

  test('a pictured segment of a justified tabbed line asks for the line’s spacing', async () => {
    const textPicture = picture()
    await paintOf(
      [
        textItem([
          line('ab\t日 本', 10, 700, {
            outside: true,
            wordSpacing: 2,
            segments: [
              { text: 'ab', origin: { x: 10, y: 700 }, width: 12, outside: false },
              { text: '日 本', origin: { x: 50, y: 700 }, width: 30, outside: true },
            ],
          }),
        ]),
      ],
      { page: 0, textPicture }
    )
    expect(textPicture.mock.calls).toEqual([
      [{ text: '日 本', font: helvetica, size: 12, color: '#000000', wordSpacing: 2 }],
    ])
  })

  test('equal text with different spacing is two pictures, equal spacing one', async () => {
    const textPicture = picture()
    const { a, content } = await paintOf(
      [
        textItem([
          line('日 本', 10, 700, { outside: true, wordSpacing: 1.5 }),
          line('日 本', 10, 686, { outside: true, wordSpacing: 1.5 }),
          line('日 本', 10, 672, { outside: true, wordSpacing: 3 }),
          line('日 本', 10, 658, { outside: true }),
        ]),
      ],
      { page: 0, textPicture }
    )
    expect(textPicture).toHaveBeenCalledTimes(3)
    expect(Object.keys(a.images!)).toEqual(['Im0', 'Im1', 'Im2'])
    expect(content.match(/\/Im0 Do/g)).toHaveLength(2)
  })

  test('an equal run is requested once and its picture reused', async () => {
    const textPicture = picture()
    const { a, content } = await paintOf(
      [
        textItem([
          line('日', 10, 700, { outside: true }),
          line('日', 10, 686, { outside: true }),
        ]),
        {
          kind: 'group',
          opacity: 0.5,
          items: [
            textItem([line('日', 10, 600, { outside: true })], {
              clip: { rect: { x: 0, y: 590, width: 100, height: 20 } },
            }),
          ],
        },
      ],
      { page: 0, textPicture }
    )
    expect(textPicture).toHaveBeenCalledTimes(1)
    expect(Object.keys(a.images!)).toEqual(['Im0'])
    expect(content.match(/\/Im0 Do/g)).toHaveLength(2)
    expect(a.forms!.Fm0!.images).toEqual({ Im0: { format: 'png', data: png } })
  })

  test('without textPicture, rejects as unpaintable text', async () => {
    const painting = paintOf([textItem([line('日本', 10, 700, { outside: true })])])
    await expect(painting).rejects.toBeInstanceOf(UnpaintableError)
    await expect(painting).rejects.toMatchObject({ reason: 'text' })
  })
})
