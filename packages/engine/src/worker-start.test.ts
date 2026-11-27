import { describe, expect, test } from 'vitest'

import { crossOriginHint, workerStart } from './worker-start.ts'

describe('how the worker is started', () => {
  const page = 'https://app.example.com/viewer/index.html'

  test('a URL on the page’s origin is started from it', () => {
    expect(workerStart('https://app.example.com/assets/worker.mjs', page)).toEqual({
      kind: 'direct',
    })
    expect(workerStart(new URL('https://app.example.com/worker.mjs'), page)).toEqual({
      kind: 'direct',
    })
  })

  test('a relative URL is on the page’s origin', () => {
    expect(workerStart('/assets/worker.mjs', page)).toEqual({ kind: 'direct' })
    expect(workerStart('worker.mjs', page)).toEqual({ kind: 'direct' })
  })

  test('a URL on another origin is imported, by its full address', () => {
    expect(workerStart('https://cdn.example.com/app/worker.mjs', page)).toEqual({
      kind: 'imported',
      href: 'https://cdn.example.com/app/worker.mjs',
    })
    expect(workerStart('//cdn.example.com/w.mjs', page)).toEqual({
      kind: 'imported',
      href: 'https://cdn.example.com/w.mjs',
    })
    // Another port, or another scheme, is another origin.
    expect(workerStart('https://app.example.com:8443/w.mjs', page)).toMatchObject({
      kind: 'imported',
    })
    expect(workerStart('http://app.example.com/w.mjs', page)).toMatchObject({
      kind: 'imported',
    })
  })

  test('a blob: or data: URL, or one that cannot be read, is started from it', () => {
    expect(workerStart('blob:https://app.example.com/1234', page)).toEqual({
      kind: 'direct',
    })
    expect(workerStart('data:text/javascript,', page)).toEqual({ kind: 'direct' })
    expect(workerStart('http://', page)).toEqual({ kind: 'direct' })
  })

  test('a page whose address has no origin, as an about:srcdoc frame, uses the origin it runs in', () => {
    const srcdoc = 'about:srcdoc'
    const origin = 'https://app.example.com'
    expect(workerStart('https://app.example.com/w.mjs', srcdoc, origin)).toEqual({
      kind: 'direct',
    })
    expect(workerStart('https://cdn.example.com/w.mjs', srcdoc, origin)).toEqual({
      kind: 'imported',
      href: 'https://cdn.example.com/w.mjs',
    })
    // A frame that really is sandboxed has an opaque origin, which every URL is another one to.
    expect(workerStart('https://app.example.com/w.mjs', srcdoc, 'null')).toMatchObject({
      kind: 'imported',
    })
  })

  test('with no page address, a URL is started from it', () => {
    expect(workerStart('https://cdn.example.com/w.mjs', undefined)).toEqual({
      kind: 'direct',
    })
  })

  test('a worker passed in is used as it is, and false runs in the calling thread', () => {
    expect(workerStart({ postMessage() {} }, page)).toEqual({ kind: 'given' })
    expect(workerStart(false, page)).toEqual({ kind: 'in-thread' })
  })
})

describe('the hint for a worker on another origin', () => {
  test('names its origin in worker-src, with blob:, and in connect-src', () => {
    const hint = crossOriginHint('https://cdn.example.com/app/worker.mjs')
    expect(hint).toContain('(https://cdn.example.com)')
    expect(hint).toContain('CORS')
    expect(hint).toContain('blob: and https://cdn.example.com in worker-src')
    expect(hint).toContain('https://cdn.example.com in connect-src')
  })
})
