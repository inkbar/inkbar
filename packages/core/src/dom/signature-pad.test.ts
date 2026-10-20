import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createTypedSignature,
  renderTypedSignature,
  signaturePreview,
} from './signature-pad'

import type { SignatureTemplate } from '../model/signatures'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A document whose canvas records what is drawn on it, and a font loader to wait on. */
function stubCanvas() {
  const drawn: { font: string; text: string; fill: string }[] = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      font: '',
      fillStyle: '',
      textBaseline: '',
      measureText: (text: string) => ({
        width: text.length * 20,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length * 20,
      }),
      fillText(this: { font: string; fillStyle: string }, text: string) {
        drawn.push({ font: this.font, text, fill: this.fillStyle })
      },
    }),
    toDataURL: (type: string) =>
      `data:${type};base64,STUB${canvas.width}x${canvas.height}`,
  }
  const load = vi.fn(() => Promise.resolve([]))
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(tag)
      return canvas
    },
    fonts: { load },
  })
  return { canvas, drawn, load }
}

describe('renderTypedSignature (stubbed canvas)', () => {
  it('waits for the font, then draws the name in it and returns a PNG', async () => {
    const { drawn, load } = stubCanvas()
    const url = await renderTypedSignature('Ada', 'Dancing Script', { color: '#112233' })
    expect(load).toHaveBeenCalledWith('60px "Dancing Script"', 'Ada')
    expect(drawn).toEqual([
      { font: '60px "Dancing Script"', text: 'Ada', fill: '#112233' },
    ])
    // 3 characters at 20 px, plus a 12 px margin either side, by the default 96 px height.
    expect(url).toBe('data:image/png;base64,STUB84x96')
  })

  it('leaves a generic family unquoted and still draws when the font fails to load', async () => {
    const { drawn, load } = stubCanvas()
    load.mockRejectedValueOnce(new Error('offline'))
    await renderTypedSignature('Ada', 'cursive', { height: 50 })
    expect(drawn[0]!.font).toBe('31.25px cursive')
  })

  it('makes an image template sized to the drawing', async () => {
    stubCanvas()
    const t = await createTypedSignature('Ada', 'cursive')
    expect(t).toMatchObject({ kind: 'image', aspect: 84 / 96 })
  })
})

describe('signaturePreview', () => {
  it('draws an ink template as filled outlines in a box of its aspect, y downwards', () => {
    const t: Extract<SignatureTemplate, { kind: 'ink' }> = {
      id: 'a',
      kind: 'ink',
      inklist: [
        [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
      ],
      aspect: 2,
    }
    const preview = signaturePreview(t)
    expect(preview.viewBox).toBe('-4 -4 208 108')
    expect(preview.paths).toHaveLength(1)
    // Starts near the top-left: the template's y = 1 is the top.
    const [x, y] = preview.paths[0]!.slice(1).split(/[L,]/).map(Number)
    expect(x).toBeLessThan(10)
    expect(y).toBeLessThan(10)
  })
})
