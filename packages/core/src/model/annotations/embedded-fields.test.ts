import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { openPdfObjects } from '../../pdf/objects'
import { nodeAssets } from '../../test-support/node-assets'
import { openDocument } from '../document'

import sample from './__fixtures__/standard-callout.json'
import { describeRedact } from './drawing/markup'
import { importEmbeddedPage, type EmbeddedTarget } from './embedded'
import { readEmbeddedFields, readLifted, withEmbeddedFields } from './embedded-fields'
import { savedDataFor } from './saved-data'

import type { Annotation, RedactAnnotation } from './types'

const NOW = '2026-10-20T00:00:00.000Z'

/** The file's objects, read from the bytes `getData` gives. */
const objectsOf = (getData: () => Promise<Uint8Array>) => () =>
  getData().then(openPdfObjects)

/** A classic-xref file whose object `n` is `objects[n - 1]`. */
function buildPdf(objects: string[]): Uint8Array {
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xrefAt = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff)
}
const twin = sample.annotations[0]!

/** What the reader imports from page 0 of `name`, before any field is read from the file. */
async function imported(name: FixtureName) {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
  })
  await doc.ready
  const raw = await doc._reader.annotations(0)
  doc.destroy()
  return importEmbeddedPage(0, raw, NOW)
}

async function read(name: FixtureName) {
  const { annotations, targets } = await imported(name)
  const patched = await readEmbeddedFields(
    annotations,
    targets,
    objectsOf(() => fixtureBytes(name))
  )
  return { annotations, targets, patched }
}

describe('readEmbeddedFields', () => {
  it('does not call getData without targets', async () => {
    const getData = vi.fn(() => fixtureBytes('standard-callout'))
    expect(await readEmbeddedFields([], [], objectsOf(getData))).toEqual(new Map())
    expect(getData).not.toHaveBeenCalled()
  })

  it('patches the standard callout with its callout, fringe, head and font', async () => {
    const { annotations, targets, patched } = await read('standard-callout')
    expect(targets).toEqual([
      expect.objectContaining({ id: annotations[0]!.id, subtype: 'FreeText' }),
    ])
    expect(patched.get(annotations[0]!.id)).toEqual({
      callout: twin.callout,
      fringe: twin.fringe,
      head: twin.head,
      font: { fontFamily: 'Helvetica' },
    })
  })

  it("patches note-icon-ap to icon 'Key'", async () => {
    const { annotations, targets, patched } = await read('note-icon-ap')
    const note = annotations.find((a) => a.type === 'text')!
    // PDF.js hides the name behind `NoIcon`, so the import took the default.
    expect(note).toMatchObject({ icon: 'Note' })
    expect(targets.map((t) => t.id)).toContain(note.id)
    expect(patched.get(note.id)).toEqual({ icon: 'Key' })
  })

  it('patches freetext-fonts to the four fonts', async () => {
    const { annotations, patched } = await read('freetext-fonts')
    expect(annotations).toHaveLength(4)
    expect(annotations.map((a) => patched.get(a.id)?.font)).toEqual([
      { fontFamily: 'Times', fontWeight: 'bold', fontStyle: 'italic' },
      { fontFamily: 'Helvetica' },
      { fontFamily: 'Courier', fontStyle: 'italic' },
      { fontFamily: 'Arial', fontWeight: 'bold' },
    ])
  })

  it('withEmbeddedFields merges onto the annotation as it is, font keys only', async () => {
    const { annotations, patched } = await read('freetext-fonts')
    const first = annotations[0]!
    if (first.type !== 'freetext') throw new Error('expected a FreeText')
    const edited: Annotation = {
      ...first,
      color: '#00FF00',
      defaultStyle: { ...first.defaultStyle, fontSize: 30 },
    }
    const merged = withEmbeddedFields(edited, patched.get(first.id)!)
    expect(merged).toMatchObject({
      color: '#00FF00',
      defaultStyle: {
        color: first.defaultStyle.color,
        fontSize: 30,
        fontFamily: 'Times',
        fontWeight: 'bold',
        fontStyle: 'italic',
      },
    })
    // Not embedded, or the wrong type: nothing to merge.
    expect(withEmbeddedFields({ ...edited, source: 'session' }, { head: 'Slash' })).toBe(
      undefined
    )
    expect(withEmbeddedFields(edited, { icon: 'Key' })).toBeUndefined()
  })

  it.each(['callout-encrypted', 'callout-bad-xref'] as const)(
    'leaves %s unchanged',
    async (name) => {
      const { targets, patched } = await read(name)
      expect(targets.length).toBeGreaterThan(0)
      expect(patched.size).toBe(0)
    }
  )

  describe('with targets built by hand', () => {
    const freetext = (id: string): Annotation => ({
      id,
      type: 'freetext',
      page: 0,
      rect: twin.rect,
      opacity: 1,
      contents: 'Standard callout',
      width: 1,
      defaultStyle: {
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: '#D00000',
        textAlign: 'left',
      },
      createdAt: NOW,
      modifiedAt: NOW,
      source: 'pdf',
      locked: true,
    })
    const RECT = [56.5, 516.5, 283.5, 663.5]
    const target = (id: string): EmbeddedTarget => ({
      id,
      subtype: 'FreeText',
      rect: RECT,
      daFont: 'Helv',
    })

    /** The callout's real object id in the fixture, from what PDF.js imported. */
    async function realId() {
      const { annotations } = await imported('standard-callout')
      return annotations[0]!.id
    }

    it('skips a target with an annot_N id', async () => {
      const id = 'pdf:0:annot_4'
      const getData = vi.fn(() => fixtureBytes('standard-callout'))
      const patched = await readEmbeddedFields(
        [freetext(id)],
        [target(id)],
        objectsOf(getData)
      )
      expect(patched.size).toBe(0)
    })

    it('patches the good targets when one ref is missing', async () => {
      const good = await realId()
      const missing = 'pdf:0:999R'
      const patched = await readEmbeddedFields(
        [freetext(missing), freetext(good)],
        [target(missing), target(good)],
        objectsOf(() => fixtureBytes('standard-callout'))
      )
      expect([...patched.keys()]).toEqual([good])
      expect(patched.get(good)).toMatchObject({ callout: twin.callout, head: twin.head })
    })

    it('returns an empty map when getData rejects', async () => {
      const id = await realId()
      await expect(
        readEmbeddedFields(
          [freetext(id)],
          [target(id)],
          objectsOf(() => Promise.reject(new Error('gone')))
        )
      ).resolves.toEqual(new Map())
    })

    it('keeps a valid callout when /LE is not a valid name', async () => {
      const bytes = buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /FreeText /CL [10 10 20 20] /LE /a#20b >>',
      ])
      const patched = await readEmbeddedFields(
        [freetext('pdf:0:2R')],
        [target('pdf:0:2R')],
        objectsOf(() => Promise.resolve(bytes))
      )
      expect(patched.get('pdf:0:2R')?.callout).toEqual([
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ])
      expect(patched.get('pdf:0:2R')?.head).toBeUndefined()
    })

    it('drops an invalid line ending name and still patches the rest', async () => {
      // `/a#20b` decodes to `a b`, which is not a valid name, so only the head is dropped.
      const bytes = buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /FreeText /LE /a#20b >>',
        '<< /Type /Annot /Subtype /Text /Name /Key >>',
      ])
      const note: Annotation = {
        id: 'pdf:0:3R',
        type: 'text',
        icon: 'Note',
        page: 0,
        rect: twin.rect,
        color: '#FFD400',
        opacity: 1,
        createdAt: NOW,
        modifiedAt: NOW,
        source: 'pdf',
        locked: true,
      }
      const patched = await readEmbeddedFields(
        [freetext('pdf:0:2R'), note],
        [target('pdf:0:2R'), { id: 'pdf:0:3R', subtype: 'Text', rect: RECT }],
        objectsOf(() => Promise.resolve(bytes))
      )
      expect(patched.get('pdf:0:2R')).toEqual({ font: { fontFamily: 'Helvetica' } })
      expect(patched.get('pdf:0:3R')).toEqual({ icon: 'Key' })
    })

    it('leaves out a target whose annotation is not in the list', async () => {
      const id = await realId()
      const getData = vi.fn(() => fixtureBytes('standard-callout'))
      expect((await readEmbeddedFields([], [target(id)], objectsOf(getData))).size).toBe(
        0
      )
      expect(getData).not.toHaveBeenCalled()
    })
  })
})

describe('readLifted', () => {
  const note = (id: string, extra: Partial<Annotation> = {}): Annotation =>
    ({
      id,
      type: 'text',
      icon: 'Note',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
      color: '#FFD400',
      opacity: 1,
      createdAt: NOW,
      modifiedAt: NOW,
      source: 'session',
      ...extra,
    }) as Annotation

  /** A one-page file whose annotations carry `data` as their saved data, at the notes' rect. */
  const fileWith = (data: string[]) => {
    const first = 4
    const annots = data.map((_, i) => `${first + i * 2} 0 R`).join(' ')
    return buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /Annots [${annots}] >>`,
      ...data.flatMap((json, i) => [
        `<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /M (D:20261020000000Z) /INKB_Gloss ${first + i * 2 + 1} 0 R >>`,
        `<< /Length ${json.length} >>\nstream\n${json}\nendstream`,
      ]),
    ])
  }
  const saved = (a: Annotation) => savedDataFor(a, a.rect)

  it('lifts in file order, with the ids PDF.js and the import give the file copies', async () => {
    const lifted = await readLifted(
      objectsOf(() => Promise.resolve(fileWith([saved(note('a')), saved(note('b'))])))
    )
    expect(lifted).toEqual([
      { annotation: note('a'), pdfjsId: '4R', embeddedId: 'pdf:0:4R' },
      { annotation: note('b'), pdfjsId: '6R', embeddedId: 'pdf:0:6R' },
    ])
  })

  it('lifts the first of two with one id, and a reply only with its parent', async () => {
    const lifted = await readLifted(
      objectsOf(() =>
        Promise.resolve(
          fileWith([
            saved(note('a')),
            saved(note('a', { contents: 'again' })),
            '{broken',
            saved(note('r1', { inReplyTo: 'gone' })),
            saved(note('r2', { inReplyTo: 'r1' })),
            saved(note('r3', { inReplyTo: 'a' })),
          ])
        )
      )
    )
    expect(lifted.map((l) => l.annotation.id)).toEqual(['a', 'r3'])
  })

  it('lifts nothing without objects, or when reading them fails', async () => {
    expect(await readLifted(() => Promise.resolve(undefined))).toEqual([])
    expect(await readLifted(() => Promise.reject(new Error('gone')))).toEqual([])
  })

  describe("another program's redaction mark", () => {
    const mark = (extra: Partial<Annotation> = {}): Annotation =>
      ({
        id: 'pdf:0:8R',
        type: 'redact',
        source: 'pdf',
        locked: true,
        page: 0,
        rect: { x: 45, y: 190, width: 170, height: 35 },
        color: '#FF0000',
        interiorColor: '#000000',
        opacity: 1,
        createdAt: NOW,
        modifiedAt: NOW,
        ...extra,
      }) as Annotation
    const marks = (m: Annotation = mark()) => new Map([[m.id, m]])
    const QUADS = '/QuadPoints [45 225 215 225 45 190 215 190]'

    /** A one-page file whose object 8 is a Redact annotation with `entries`; `more` are extra objects 9 onwards. */
    const markFile = (entries: string, more: string[] = [], annots = '8 0 R') =>
      buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /Annots [${annots}] >>`,
        '<< >>',
        '<< >>',
        '<< >>',
        '<< >>',
        `<< /Type /Annot /Subtype /Redact /Rect [45 190 215 225] ${entries} >>`,
        ...more,
      ])
    const lift = (bytes: Uint8Array, m?: ReadonlyMap<string, Annotation>) =>
      readLifted(
        objectsOf(() => Promise.resolve(bytes)),
        undefined,
        m
      )

    it('adopts it', async () => {
      const lifted = await lift(markFile(`${QUADS} /IC [1 0 0]`), marks())
      expect(lifted).toHaveLength(1)
      const [one] = lifted
      expect(one).toMatchObject({ pdfjsId: '8R', embeddedId: 'pdf:0:8R' })
      expect(one!.popupId).toBeUndefined()
      const a = one!.annotation
      expect(a).toMatchObject({
        id: 'redact-8R',
        type: 'redact',
        source: 'session',
        interiorColor: '#FF0000',
      })
      expect(a.locked).toBeUndefined()
      expect(a).not.toHaveProperty('hasAppearance')
      const quads = (a as { quads?: unknown }).quads
      expect(quads).toEqual([
        {
          p1: { x: 45, y: 225 },
          p2: { x: 215, y: 225 },
          p3: { x: 45, y: 190 },
          p4: { x: 215, y: 190 },
        },
      ])
      expect(a).not.toHaveProperty('overlayText')
    })

    it('keeps its overlay text', async () => {
      const [one] = await lift(markFile(`${QUADS} /OverlayText (EXEMPT)`), marks())
      expect(one!.annotation).toMatchObject({ type: 'redact', overlayText: 'EXEMPT' })
    })

    it('carries a listed pop-up', async () => {
      const lifted = await lift(
        markFile(
          `${QUADS} /Popup 9 0 R`,
          ['<< /Type /Annot /Subtype /Popup /Parent 8 0 R >>'],
          '8 0 R 9 0 R'
        ),
        marks()
      )
      expect(lifted.map((l) => l.popupId)).toEqual(['9R'])
    })

    it('leaves a mark whose pop-up is not listed', async () => {
      const lifted = await lift(
        markFile(`${QUADS} /Popup 9 0 R`, [
          '<< /Type /Annot /Subtype /Popup /Parent 8 0 R >>',
        ]),
        marks()
      )
      expect(lifted).toEqual([])
    })

    it('adopts a mark with bad quad points as an area mark', async () => {
      for (const bad of [
        '/QuadPoints []',
        '/QuadPoints [1 2 3]',
        '/QuadPoints [45 190 45 190 45 190 45 190]',
      ]) {
        const lifted = await lift(markFile(bad), marks())
        expect(lifted).toHaveLength(1)
        const a = lifted[0]!.annotation
        expect(a).not.toHaveProperty('quads')
        expect(a.rect).toEqual(mark().rect)
      }
    })

    it('keeps the imported fill when /IC is absent', async () => {
      const lifted = await lift(
        markFile(QUADS),
        marks(mark({ interiorColor: '#123456' }))
      )
      expect((lifted[0]!.annotation as { interiorColor: string }).interiorColor).toBe(
        '#123456'
      )
    })

    it('reads grey and CMYK fills', async () => {
      const grey = await lift(markFile('/IC [0.5]'), marks())
      expect((grey[0]!.annotation as { interiorColor: string }).interiorColor).toBe(
        '#808080'
      )
      const cmyk = await lift(markFile('/IC [0 0 0 1]'), marks())
      expect((cmyk[0]!.annotation as { interiorColor: string }).interiorColor).toBe(
        '#000000'
      )
    })

    it('takes a fill component outside 0..1 as the nearer end', async () => {
      for (const ic of ['/IC [255 0 0]', '/IC [2 -1 0]']) {
        const lifted = await lift(markFile(ic), marks())
        expect((lifted[0]!.annotation as { interiorColor: string }).interiorColor).toBe(
          '#FF0000'
        )
      }
    })

    describe('corner order', () => {
      const upright = [
        {
          p1: { x: 45, y: 225 },
          p2: { x: 215, y: 225 },
          p3: { x: 45, y: 190 },
          p4: { x: 215, y: 190 },
        },
      ]
      const quadsOf = async (quadPoints: string) =>
        (
          (await lift(markFile(`/QuadPoints ${quadPoints}`), marks()))[0]!.annotation as {
            quads?: unknown
          }
        ).quads

      it("puts the specification's order, round the edge, in reading order", async () => {
        expect(await quadsOf('[45 190 215 190 215 225 45 225]')).toEqual(upright)
      })

      it('puts bottom-left, bottom-right, top-left, top-right in reading order', async () => {
        expect(await quadsOf('[45 190 215 190 45 225 215 225]')).toEqual(upright)
      })

      it("draws the specification's order as the box, not crossed", async () => {
        const [one] = await lift(
          markFile('/QuadPoints [45 190 215 190 215 225 45 225]'),
          marks()
        )
        const drawn = describeRedact(one!.annotation as RedactAnnotation)
        const group = drawn.items[0]!
        const polygon = group.kind === 'group' ? group.items[0]! : group
        expect(polygon.kind).toBe('polygon')
        // Round the box: top-left, top-right, bottom-right, bottom-left.
        expect(polygon.kind === 'polygon' && polygon.points).toEqual([
          { x: 45, y: 225 },
          { x: 215, y: 225 },
          { x: 215, y: 190 },
          { x: 45, y: 190 },
        ])
      })
    })

    it('gives a mark with quads their bounding box as its rect', async () => {
      // The file's /Rect reaches 5 points past the quads on every side.
      const wide = mark({ rect: { x: 40, y: 185, width: 180, height: 45 } })
      const lifted = await lift(markFile(QUADS), marks(wide))
      expect(lifted[0]!.annotation.rect).toEqual({
        x: 45,
        y: 190,
        width: 170,
        height: 35,
      })
    })

    it('adopts nothing when the adopted mark fails the schema', async () => {
      // The imported annotation it starts from has an opacity past 1.
      expect(await lift(markFile(QUADS), marks(mark({ opacity: 2 })))).toEqual([])
    })

    it('leaves the mark out when a saved annotation has its id', async () => {
      const json = saved(note('redact-4R'))
      const bytes = buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Annots [4 0 R 5 0 R] >>',
        `<< /Type /Annot /Subtype /Redact /Rect [45 190 215 225] ${QUADS} >>`,
        '<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /M (D:20261020000000Z) /INKB_Gloss 6 0 R >>',
        `<< /Length ${json.length} >>\nstream\n${json}\nendstream`,
      ])
      const lifted = await lift(bytes, marks(mark({ id: 'pdf:0:4R' })))
      expect(lifted.map((l) => [l.annotation.id, l.annotation.type, l.pdfjsId])).toEqual([
        ['redact-4R', 'text', '5R'],
      ])
    })

    it('leaves a mark another program replied to', async () => {
      const lifted = await lift(
        markFile(
          QUADS,
          ['<< /Type /Annot /Subtype /Text /Rect [0 0 1 1] /IRT 8 0 R >>'],
          '8 0 R 9 0 R'
        ),
        marks()
      )
      expect(lifted).toEqual([])
    })

    it('adopts nothing without the imported annotation', async () => {
      expect(await lift(markFile(QUADS))).toEqual([])
    })

    it('adopts nothing when objects are unavailable', async () => {
      expect(
        await readLifted(() => Promise.resolve(undefined), undefined, marks())
      ).toEqual([])
    })

    it('lifts a saved annotation and an adopted mark together, saved first', async () => {
      const json = saved(note('a'))
      const bytes = buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Annots [4 0 R 5 0 R] >>',
        '<< /Type /Annot /Subtype /Redact /Rect [45 190 215 225] >>',
        '<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /M (D:20261020000000Z) /INKB_Gloss 6 0 R >>',
        `<< /Length ${json.length} >>\nstream\n${json}\nendstream`,
      ])
      // The mark is first in the file; the saved annotation is object 5, after it.
      const lifted = await lift(bytes, marks(mark({ id: 'pdf:0:4R' })))
      expect(lifted.map((l) => l.annotation.id)).toEqual(['a', 'redact-4R'])
    })
  })
})
