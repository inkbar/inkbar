import { afterEach, describe, expect, it } from 'vitest'

import {
  createImageSignature,
  createSignaturePad,
  createTypedSignature,
  renderTypedSignature,
} from './signature-pad'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function padHost(): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = 'width:400px;height:150px;position:relative;'
  document.body.append(host)
  cleanup.push(() => host.remove())
  return host
}

function pen(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  pressure: number
): void {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX: r.left + x,
      clientY: r.top + y,
      bubbles: true,
      pointerId: 7,
      pointerType: 'pen',
      pressure,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      isPrimary: true,
    })
  )
}

/** A 3x1 PNG's bytes. */
const PNG_3x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII='
const bytes = (b64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function imageSize(src: string): Promise<{ width: number; height: number }> {
  const img = new Image()
  img.src = src
  await img.decode()
  return { width: img.naturalWidth, height: img.naturalHeight }
}

describe('signature pad', () => {
  it('signature pad produces an ink template', () => {
    const pad = createSignaturePad(padHost())
    cleanup.push(() => pad.destroy())
    const el = pad.element
    expect(pad.empty.get()).toBe(true)
    expect(pad.toTemplate()).toBeUndefined()
    // A stroke down and to the right, then a short one beside it.
    pen(el, 'pointerdown', 20, 20, 0.3)
    pen(el, 'pointermove', 120, 60, 0.6)
    pen(el, 'pointermove', 220, 100, 0.9)
    // Drawn live, with the draw tool's renderer: one filled outline per stroke.
    expect(el.querySelectorAll('path.ink-stroke')).toHaveLength(1)
    pen(el, 'pointerup', 220, 100, 0)
    pen(el, 'pointerdown', 300, 40, 0.5)
    pen(el, 'pointermove', 320, 60, 0.7)
    pen(el, 'pointerup', 320, 60, 0)
    expect(el.querySelectorAll('path.ink-stroke')).toHaveLength(2)
    expect(el.querySelector('path.ink-stroke')!.getAttribute('d')).toMatch(/^M/)
    expect(pad.empty.get()).toBe(false)

    const t = pad.toTemplate()
    if (t?.kind !== 'ink') throw new Error('no ink template')
    expect(t.inklist).toHaveLength(2)
    expect(t.pressure).toEqual([
      [0.3, 0.6, 0.9],
      [0.5, 0.7],
    ])
    for (const p of t.inklist.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
    // 300 wide by 80 high, and y grows upwards: the first point is the top-left.
    expect(t.aspect).toBeCloseTo(300 / 80, 5)
    expect(t.inklist[0]![0]).toEqual({ x: 0, y: 1 })

    pad.clear()
    expect(pad.empty.get()).toBe(true)
    expect(el.querySelectorAll('path.ink-stroke')).toHaveLength(0)
  })

  it('a mouse stroke has no pressure', () => {
    const pad = createSignaturePad(padHost())
    cleanup.push(() => pad.destroy())
    const el = pad.element
    const r = el.getBoundingClientRect()
    const at = (type: string, x: number, y: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          clientX: r.left + x,
          clientY: r.top + y,
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          pressure: type === 'pointerup' ? 0 : 0.5,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        })
      )
    at('pointerdown', 10, 10)
    at('pointermove', 100, 40)
    at('pointerup', 100, 40)
    const t = pad.toTemplate()
    expect(t).toMatchObject({ kind: 'ink' })
    expect(t && 'pressure' in t).toBe(false)
  })
})

describe('typed signature', () => {
  it('typed signature produces an image template', async () => {
    const url = await renderTypedSignature('Ada Lovelace', 'cursive')
    expect(url).toMatch(/^data:image\/png;base64,/)
    const size = await imageSize(url)
    expect(size.height).toBe(96)
    expect(size.width).toBeGreaterThan(size.height)

    const t = await createTypedSignature('Ada Lovelace', 'cursive')
    if (t.kind !== 'image') throw new Error('no image template')
    const placed = await imageSize(t.imagedata)
    expect(t.aspect).toBeCloseTo(placed.width / placed.height, 5)
  })

  it('refuses an empty name', async () => {
    await expect(renderTypedSignature('  ', 'cursive')).rejects.toThrow(RangeError)
  })
})

describe('image signature', () => {
  it('takes a PNG or JPEG file and keeps its aspect', async () => {
    const file = new File([bytes(PNG_3x1)], 'scan.png', { type: 'image/png' })
    const t = await createImageSignature(file)
    expect(t).toMatchObject({ kind: 'image', aspect: 3 })
    expect(t.kind === 'image' && t.imagedata).toMatch(/^data:image\/png;base64,/)
  })

  /** A `width` x `height` image file of noise (so it compresses badly, like a photo). */
  async function noise(width: number, height: number, type: string): Promise<File> {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const data = ctx.createImageData(width, height)
    for (let i = 0; i < data.data.length; i += 65536)
      crypto.getRandomValues(data.data.subarray(i, i + 65536))
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255
    ctx.putImageData(data, 0, 0)
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), type)
    )
    return new File([blob], 'scan', { type })
  }

  it('scales a large image down to 1000 px on its long side, keeping its type', async () => {
    const png = await noise(3000, 1500, 'image/png')
    expect(png.size).toBeGreaterThan(4_000_000)
    const t = await createImageSignature(png)
    if (t.kind !== 'image') throw new Error('no image')
    expect(t.imagedata).toMatch(/^data:image\/png;base64,/)
    expect(await imageSize(t.imagedata)).toEqual({ width: 1000, height: 500 })
    expect(t.aspect).toBeCloseTo(2, 5)

    const jpeg = await noise(1200, 1600, 'image/jpeg')
    const j = await createImageSignature(jpeg)
    if (j.kind !== 'image') throw new Error('no image')
    expect(j.imagedata).toMatch(/^data:image\/jpeg;base64,/)
    expect(await imageSize(j.imagedata)).toEqual({ width: 750, height: 1000 })
  })

  it('refuses any other file', async () => {
    const file = new File(['<svg/>'], 'scan.svg', { type: 'image/svg+xml' })
    await expect(createImageSignature(file)).rejects.toThrow(TypeError)
  })
})
