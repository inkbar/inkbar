import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { openDocument } from '../document'

import sample from './__fixtures__/standard-callout.json'
import { importEmbeddedPage, type EmbeddedTarget } from './embedded'
import { readEmbeddedFields } from './embedded-fields'

import type { Annotation } from './types'
import type { PdfjsAnnotationData } from '../../pdfjs/types'

const NOW = '2026-10-20T00:00:00.000Z'

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

/** What PDF.js imports from page 0 of `name`, before any field is read from the file. */
async function imported(name: FixtureName) {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    verbosity: 0,
  })
  await doc.ready
  const page = await doc._pdfjs.getPage(0)
  const raw = (await page.getAnnotations()) as unknown as PdfjsAnnotationData[]
  doc.destroy()
  return importEmbeddedPage(0, raw, NOW)
}

async function read(name: FixtureName) {
  const { annotations, targets } = await imported(name)
  const patched = await readEmbeddedFields(annotations, targets, () => fixtureBytes(name))
  return { annotations, targets, patched }
}

describe('readEmbeddedFields', () => {
  it('does not call getData without targets', async () => {
    const getData = vi.fn(() => fixtureBytes('standard-callout'))
    expect(await readEmbeddedFields([], [], getData)).toEqual(new Map())
    expect(getData).not.toHaveBeenCalled()
  })

  it('patches the standard callout with its callout, fringe, head and font', async () => {
    const { annotations, targets, patched } = await read('standard-callout')
    expect(targets).toEqual([
      expect.objectContaining({ id: annotations[0]!.id, subtype: 'FreeText' }),
    ])
    expect(patched.get(annotations[0]!.id)).toMatchObject({
      callout: twin.callout,
      fringe: twin.fringe,
      head: twin.head,
      defaultStyle: { fontFamily: 'Helvetica' },
      source: 'pdf',
      locked: true,
    })
  })

  it("patches note-icon-ap to icon 'Key'", async () => {
    const { annotations, targets, patched } = await read('note-icon-ap')
    const note = annotations.find((a) => a.type === 'text')!
    // PDF.js hides the name behind `NoIcon`, so the import took the default.
    expect(note).toMatchObject({ icon: 'Note' })
    expect(targets.map((t) => t.id)).toContain(note.id)
    expect(patched.get(note.id)).toMatchObject({ type: 'text', icon: 'Key' })
  })

  it('patches freetext-fonts to the four fonts', async () => {
    const { annotations, patched } = await read('freetext-fonts')
    expect(annotations).toHaveLength(4)
    const styles = annotations.map((a) => {
      const p = patched.get(a.id)
      return p?.type === 'freetext' ? p.defaultStyle : undefined
    })
    expect(styles).toEqual([
      expect.objectContaining({
        fontFamily: 'Times',
        fontWeight: 'bold',
        fontStyle: 'italic',
      }),
      expect.objectContaining({ fontFamily: 'Helvetica' }),
      expect.objectContaining({ fontFamily: 'Courier', fontStyle: 'italic' }),
      expect.objectContaining({ fontFamily: 'Arial', fontWeight: 'bold' }),
    ])
    for (const s of styles) {
      expect(s).not.toBeUndefined()
      // The size and colour PDF.js read from /DA stay.
      expect(s).toHaveProperty('color')
    }
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
      const patched = await readEmbeddedFields([freetext(id)], [target(id)], getData)
      expect(patched.size).toBe(0)
    })

    it('patches the good targets when one ref is missing', async () => {
      const good = await realId()
      const missing = 'pdf:0:999R'
      const patched = await readEmbeddedFields(
        [freetext(missing), freetext(good)],
        [target(missing), target(good)],
        () => fixtureBytes('standard-callout')
      )
      expect([...patched.keys()]).toEqual([good])
      expect(patched.get(good)).toMatchObject({ callout: twin.callout, head: twin.head })
    })

    it('returns an empty map when getData rejects', async () => {
      const id = await realId()
      await expect(
        readEmbeddedFields([freetext(id)], [target(id)], () =>
          Promise.reject(new Error('gone'))
        )
      ).resolves.toEqual(new Map())
    })

    it('leaves out a patch the schema refuses', async () => {
      // `/a#20b` decodes to `a b`, which is not a valid line ending name; the note's icon is fine.
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
        () => Promise.resolve(bytes)
      )
      expect([...patched.keys()]).toEqual(['pdf:0:3R'])
      expect(patched.get('pdf:0:3R')).toMatchObject({ icon: 'Key' })
    })

    it('leaves out a target whose annotation is not in the list', async () => {
      const id = await realId()
      const getData = vi.fn(() => fixtureBytes('standard-callout'))
      expect((await readEmbeddedFields([], [target(id)], getData)).size).toBe(0)
      expect(getData).not.toHaveBeenCalled()
    })
  })
})
