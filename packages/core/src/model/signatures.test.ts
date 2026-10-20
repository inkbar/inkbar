import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createImageTemplate,
  createInkTemplate,
  createLocalSignatureStore,
  createMemorySignatureStore,
  createSignatureLibrary,
  normaliseInk,
  placeSignature,
  type SignatureTemplate,
} from './signatures'

import type { Point } from './geometry'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const ink: SignatureTemplate = {
  id: 'ink-1',
  kind: 'ink',
  inklist: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  ],
  aspect: 3,
}
const image: SignatureTemplate = {
  id: 'image-1',
  kind: 'image',
  imagedata: PNG,
  aspect: 3,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseInk', () => {
  it('puts every point in 0..1 and keeps the aspect', () => {
    const { inklist, aspect } = normaliseInk([
      [
        { x: 100, y: 50 },
        { x: 300, y: 150 },
      ],
      [{ x: 200, y: 100 }],
    ])
    for (const p of inklist.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
    expect(aspect).toBeCloseTo(2)
    expect(inklist).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [{ x: 0.5, y: 0.5 }],
    ])
  })

  it('gives a flat stroke a finite aspect and centres it across', () => {
    const { inklist, aspect } = normaliseInk([
      [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ],
    ])
    expect(Number.isFinite(aspect)).toBe(true)
    expect(aspect).toBeGreaterThan(10)
    expect(inklist[0]!.map((p) => p.y)).toEqual([0.5, 0.5])
  })

  it('makes a single dot a square', () => {
    expect(normaliseInk([[{ x: 4, y: 4 }]])).toEqual({
      inklist: [[{ x: 0.5, y: 0.5 }]],
      aspect: 1,
    })
  })
})

describe('placeSignature', () => {
  it('places an ink template as ink signed Signature, 150 wide, centred on the point', () => {
    const input = placeSignature(ink, 2, { x: 300, y: 400 })
    expect(input).toMatchObject({
      type: 'ink',
      page: 2,
      subject: 'Signature',
      width: 2,
      rect: { x: 225, y: 375, width: 150, height: 50 },
    })
    // The strokes sit inside the rect by half the stroke width.
    const points = (input as { inklist: Point[][] }).inklist[0]!
    expect(points[0]).toEqual({ x: 226, y: 376 })
    expect(points[1]).toEqual({ x: 374, y: 424 })
  })

  it('carries pressure and takes a width', () => {
    const input = placeSignature(
      { ...ink, pressure: [[0.2, 0.8]] },
      0,
      { x: 0, y: 0 },
      300
    )
    expect(input).toMatchObject({
      pressure: [[0.2, 0.8]],
      rect: { x: -150, y: -50, width: 300, height: 100 },
    })
  })

  it('places an image template as a stamp signed Signature', () => {
    expect(placeSignature(image, 1, { x: 300, y: 400 })).toEqual({
      type: 'stamp',
      page: 1,
      subject: 'Signature',
      imagedata: PNG,
      rect: { x: 225, y: 375, width: 150, height: 50 },
    })
  })

  it('turns the signature against the rotation, so it reads upright on a turned page', () => {
    const turned = placeSignature(ink, 0, { x: 300, y: 400 }, 150, 90)
    expect(turned).toMatchObject({ rect: { x: 275, y: 325, width: 50, height: 150 } })
    // Upright bottom-left becomes the bottom-right in user space: a quarter turn anticlockwise.
    const [first, last] = (turned as { inklist: Point[][] }).inklist[0]!
    expect(first!.x).toBeCloseTo(324)
    expect(first!.y).toBeCloseTo(326)
    expect(last!.x).toBeCloseTo(276)
    expect(last!.y).toBeCloseTo(474)
    expect(placeSignature(image, 0, { x: 300, y: 400 }, 150, 270)).toMatchObject({
      type: 'stamp',
      rotation: 270,
      rect: { x: 275, y: 325, width: 50, height: 150 },
    })
  })
})

describe('template helpers', () => {
  it('builds an ink template from y-up points, with an id', () => {
    const t = createInkTemplate(
      [
        [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
      ],
      [[0.3, 0.6]]
    )
    expect(t).toMatchObject({ kind: 'ink', aspect: 2, pressure: [[0.3, 0.6]] })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('builds an image template and refuses anything but a PNG or JPEG data URL', () => {
    expect(createImageTemplate(PNG, 4)).toMatchObject({
      kind: 'image',
      imagedata: PNG,
      aspect: 4,
    })
    expect(() => createImageTemplate('http://example.com/a.png', 1)).toThrow(TypeError)
  })

  it('refuses ink with no strokes, an empty stroke, or pressure shaped unlike the strokes', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
    ]
    expect(() => createInkTemplate([])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke, []])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke], [[0.5]])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke], [[0.5, 0.5], [0.5]])).toThrow(RangeError)
  })
})

describe('createMemorySignatureStore', () => {
  it('saves, lists, replaces by id and removes', async () => {
    const store = createMemorySignatureStore([ink])
    await store.save(image)
    expect((await store.list()).map((t) => t.id)).toEqual(['ink-1', 'image-1'])
    await store.save({ ...ink, aspect: 5 })
    expect(await store.list()).toEqual([{ ...ink, aspect: 5 }, image])
    await store.remove('ink-1')
    expect(await store.list()).toEqual([image])
  })

  it('hands out copies', async () => {
    const store = createMemorySignatureStore([ink])
    const [t] = await store.list()
    ;(t as { aspect: number }).aspect = 99
    expect((await store.list())[0]!.aspect).toBe(3)
  })
})

/** A `localStorage` over a map. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('createLocalSignatureStore', () => {
  it('keeps templates in localStorage under its key', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    await createLocalSignatureStore('sigs').save(ink)
    expect(JSON.parse(storage.getItem('sigs')!)).toEqual([ink])
    expect(await createLocalSignatureStore('sigs').list()).toEqual([ink])
    await createLocalSignatureStore('sigs').remove('ink-1')
    expect(await createLocalSignatureStore('sigs').list()).toEqual([])
  })

  it('survives a throwing localStorage by keeping templates in memory', async () => {
    vi.stubGlobal('localStorage', undefined)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    const store = createLocalSignatureStore('sigs')
    await store.save(ink)
    await store.save(image)
    expect(await store.list()).toEqual([ink, image])
    await store.remove('ink-1')
    expect(await store.list()).toEqual([image])
  })

  it('keeps templates in memory where storage refuses every write', async () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new DOMException('blocked', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', storage)
    const store = createLocalSignatureStore('sigs')
    await store.save(ink)
    expect(await store.list()).toEqual([ink])
  })

  // A full store fails even the probe's tiny write, but it still holds the saved list.
  it('reads a full store and rejects saves to it, rather than falling back to memory', async () => {
    const storage = memoryStorage()
    storage.setItem('sigs', JSON.stringify([ink]))
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', storage)
    const store = createLocalSignatureStore('sigs')
    expect(await store.list()).toEqual([ink])
    await expect(store.save(image)).rejects.toThrow(/could not be saved/)
    expect(await store.list()).toEqual([ink])
  })

  it('rejects a save that storage has no room for, and keeps what was there', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const store = createLocalSignatureStore('sigs')
    await store.save(ink)
    const setItem = storage.setItem.bind(storage)
    storage.setItem = (k, v) => {
      if (v.length > JSON.stringify([ink]).length)
        throw new DOMException('full', 'QuotaExceededError')
      setItem(k, v)
    }
    await expect(store.save(image)).rejects.toThrow(/could not be saved/)
    expect(await store.list()).toEqual([ink])
    expect(await createLocalSignatureStore('sigs').list()).toEqual([ink])
  })

  it('skips stored entries that are not templates', async () => {
    const storage = memoryStorage()
    storage.setItem('sigs', JSON.stringify([ink, { id: 'x', kind: 'nope' }, 7]))
    vi.stubGlobal('localStorage', storage)
    expect(await createLocalSignatureStore('sigs').list()).toEqual([ink])
    // Pressure that does not match the strokes would throw when placed: skipped too.
    storage.setItem('sigs', JSON.stringify([{ ...ink, pressure: [[0.5]] }, image]))
    expect(await createLocalSignatureStore('sigs').list()).toEqual([image])
    storage.setItem('sigs', '{not json')
    expect(await createLocalSignatureStore('sigs').list()).toEqual([])
  })

  // A newer version's template, or a hand-edited one, must survive this version's writes.
  it('writes back stored entries it cannot read, unchanged', async () => {
    const storage = memoryStorage()
    const future = { id: 'f', kind: 'vector', paths: ['M0 0'] }
    storage.setItem('sigs', JSON.stringify([ink, future, 7]))
    vi.stubGlobal('localStorage', storage)
    const store = createLocalSignatureStore('sigs')
    await store.save(image)
    expect(JSON.parse(storage.getItem('sigs')!)).toEqual([ink, image, future, 7])
    await store.remove('ink-1')
    expect(JSON.parse(storage.getItem('sigs')!)).toEqual([image, future, 7])
    expect(await store.list()).toEqual([image])
    // Saving a template with an unreadable entry's id replaces that entry.
    await store.save({ ...image, id: 'f' })
    expect(JSON.parse(storage.getItem('sigs')!)).toEqual([
      image,
      { ...image, id: 'f' },
      7,
    ])
  })
})

describe('createSignatureLibrary', () => {
  it('loads, saves and removes through the store, and finds templates by id', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    expect(library.templates.get()).toEqual([])
    await library.refresh()
    expect(library.templates.get()).toEqual([ink])
    expect(library.get('ink-1')).toEqual(ink)
    await library.save(image)
    expect(await store.list()).toEqual([ink, image])
    expect(library.templates.get()).toEqual([ink, image])
    await library.remove('ink-1')
    expect(library.templates.get()).toEqual([image])
    expect(library.get('ink-1')).toBeUndefined()
  })

  it('leaves out templates that are not valid, whatever store they come from', async () => {
    const bad = { ...ink, id: 'bad', pressure: [[0.5]] } as SignatureTemplate
    const library = createSignatureLibrary(createMemorySignatureStore([bad, image]))
    await library.refresh()
    expect(library.templates.get()).toEqual([image])
  })

  it('reports a removal the store refuses as removeError until cleared', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    await library.refresh()
    store.remove = () => Promise.reject(new Error('full'))
    await expect(library.remove('ink-1')).rejects.toThrow('full')
    expect(library.removeError.get()).toMatch(/could not be removed/)
    expect(library.templates.get()).toEqual([ink])
    library.clearRemoveError()
    expect(library.removeError.get()).toBeUndefined()
  })

  it('keeps a slow load that succeeds when a later one fails', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    let finish!: (l: SignatureTemplate[]) => void
    store.list = () => new Promise((resolve) => (finish = resolve))
    const slow = library.refresh()
    store.list = () => Promise.reject(new Error('offline'))
    await library.refresh()
    finish([ink])
    await slow
    expect(library.templates.get()).toEqual([ink])
  })

  it('ignores a slow load that finishes after a later one succeeded', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    let finish!: (l: SignatureTemplate[]) => void
    store.list = () => new Promise((resolve) => (finish = resolve))
    const slow = library.refresh()
    store.list = () => Promise.resolve([image])
    await library.refresh()
    finish([ink])
    await slow
    expect(library.templates.get()).toEqual([image])
  })

  it('keeps the last list when the store fails to list', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    await library.refresh()
    store.list = () => Promise.reject(new Error('offline'))
    await library.refresh()
    expect(library.templates.get()).toEqual([ink])
  })
})
