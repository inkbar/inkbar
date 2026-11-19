import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { EngineError } from './errors.ts'
import {
  createFontLoader,
  FONT_BITS,
  FONT_FETCH_TIMEOUT_MS,
  keysOf,
  type FontSources,
} from './fonts.ts'

import type { FontKey } from './types.ts'

const FONT = new Uint8Array([0, 1, 0, 0, 7, 7, 7])
/** A real font file on disk, for the Node path tests. */
const onDisk = createRequire(import.meta.url).resolve(
  '@inkbar/fonts/files/NotoSans-Regular.ttf'
)
let diskBytes: Uint8Array

beforeAll(async () => {
  diskBytes = new Uint8Array(await readFile(onDisk))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A stubbed `fetch` that answers every URL with `FONT`, counting calls. */
function stubFetch(
  answer: () => Promise<Response> = () => Promise.resolve(new Response(FONT))
) {
  const fetch = vi.fn((_url: string, _init?: RequestInit) => answer())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const accept = () => vi.fn((_key: FontKey, _bytes: Uint8Array) => true)

test('the key bits', () => {
  expect(FONT_BITS).toEqual({
    japanese: 1,
    'simplified-chinese': 2,
    'traditional-chinese': 4,
    korean: 8,
    default: 16,
  })
  expect(keysOf(1 | 16)).toEqual(['japanese', 'default'])
  expect(keysOf(0)).toEqual([])
  expect(keysOf(31)).toEqual([
    'japanese',
    'simplified-chinese',
    'traditional-chinese',
    'korean',
    'default',
  ])
  // A bit no key has is ignored.
  expect(keysOf(32 | 8)).toEqual(['korean'])
})

test('a key is fetched once, and its bytes registered', async () => {
  const fetch = stubFetch()
  const register = accept()
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, register)
  expect(await loader.ensure(['japanese'])).toEqual([])
  expect(await loader.ensure(['japanese'])).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]?.[0]).toBe('https://fonts.test/jp.otf')
  expect(register).toHaveBeenCalledTimes(1)
  expect(register.mock.calls[0]?.[0]).toBe('japanese')
  expect(register.mock.calls[0]?.[1]).toEqual(FONT)
})

test('a rejected fetch leaves the key missing, and it is not fetched again', async () => {
  const fetch = stubFetch(() => Promise.reject(new TypeError('network down')))
  const register = accept()
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, register)
  expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
  expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(register).not.toHaveBeenCalled()
})

test('a response that is not 2xx fails the key', async () => {
  const fetch = stubFetch(() => Promise.resolve(new Response('gone', { status: 404 })))
  const register = accept()
  const loader = createFontLoader({ korean: 'https://fonts.test/kr.otf' }, register)
  expect(await loader.ensure(['korean'])).toEqual(['korean'])
  expect(await loader.ensure(['korean'])).toEqual(['korean'])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(register).not.toHaveBeenCalled()
})

test('bytes the register rejects fail the key', async () => {
  const fetch = stubFetch()
  const register = vi.fn(() => false)
  const loader = createFontLoader({ default: 'https://fonts.test/sans.ttf' }, register)
  expect(await loader.ensure(['default'])).toEqual(['default'])
  expect(await loader.ensure(['default'])).toEqual(['default'])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledTimes(1)
})

test('a key with no source is missing without a fetch', async () => {
  const fetch = stubFetch()
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
  expect(await loader.ensure(['korean'])).toEqual(['korean'])
  expect(await createFontLoader(undefined, accept()).ensure(['default'])).toEqual([
    'default',
  ])
  expect(fetch).not.toHaveBeenCalled()
})

test('no keys fetch nothing', async () => {
  const fetch = stubFetch()
  const loader = createFontLoader(
    { japanese: 'https://fonts.test/jp.otf', default: 'https://fonts.test/sans.ttf' },
    accept()
  )
  expect(await loader.ensure([])).toEqual([])
  expect(fetch).not.toHaveBeenCalled()
})

test('bytes given up front are registered without a fetch', async () => {
  const fetch = stubFetch()
  const register = accept()
  const loader = createFontLoader({ japanese: FONT }, register)
  expect(await loader.ensure(['japanese', 'korean'])).toEqual(['korean'])
  expect(fetch).not.toHaveBeenCalled()
  expect(register).toHaveBeenCalledWith('japanese', FONT)
})

test('in Node a path or a file: URL is read from disk', async () => {
  const fetch = stubFetch()
  const register = accept()
  const loader = createFontLoader(
    {
      japanese: onDisk,
      korean: pathToFileURL(onDisk),
      default: pathToFileURL(onDisk).href,
      'simplified-chinese': join(dirname(onDisk), 'no-such-file.otf'),
    },
    register
  )
  expect(
    await loader.ensure(['japanese', 'korean', 'default', 'simplified-chinese'])
  ).toEqual(['simplified-chinese'])
  expect(fetch).not.toHaveBeenCalled()
  expect(register).toHaveBeenCalledTimes(3)
  for (const call of register.mock.calls) expect(call[1]).toEqual(diskBytes)
})

test('an abort during a fetch rejects with aborted and does not fail the key', async () => {
  let release: (() => void) | undefined
  const fetch = stubFetch()
  fetch.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        release = () => {
          resolve(new Response(FONT))
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
  )
  const register = accept()
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, register)
  const controller = new AbortController()
  const ensured = loader.ensure(['japanese'], controller.signal)
  await vi.waitFor(() => {
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  controller.abort()
  await expect(ensured).rejects.toMatchObject({ code: 'aborted' })
  release?.()
  expect(register).not.toHaveBeenCalled()
  // Not marked failed: the next call fetches it again.
  expect(await loader.ensure(['japanese'])).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(register).toHaveBeenCalledTimes(1)
})

test('an abort is seen even when the fetch ignores its signal', async () => {
  const fetch = stubFetch(() => new Promise<Response>(() => {}))
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
  const controller = new AbortController()
  const ensured = loader.ensure(['japanese'], controller.signal)
  await vi.waitFor(() => {
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  controller.abort()
  await expect(ensured).rejects.toMatchObject({ code: 'aborted' })
})

test('a signal aborted before the call fetches nothing', async () => {
  const fetch = stubFetch()
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
  await expect(loader.ensure(['japanese'], AbortSignal.abort())).rejects.toMatchObject({
    code: 'aborted',
  })
  expect(fetch).not.toHaveBeenCalled()
})

test('a register that runs out of memory fails the key, not the call', async () => {
  const fetch = stubFetch()
  const register = vi.fn((): boolean => {
    throw new EngineError('out-of-memory', 'The engine ran out of memory.')
  })
  const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, register)
  expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
  expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledTimes(1)
})

test('any other error from register reaches the caller', async () => {
  stubFetch()
  const failure = new EngineError('engine-failure', 'The engine failed: unreachable')
  const loader = createFontLoader({ default: new Uint8Array([1]) }, () => {
    throw failure
  })
  await expect(loader.ensure(['default'])).rejects.toBe(failure)
})

test('a loader with no sources fetches nothing and says so', async () => {
  const fetch = stubFetch()
  // A host in plain JavaScript can pass a key with no value.
  const holes = { japanese: undefined } as unknown as FontSources
  for (const sources of [undefined, {}, holes]) {
    const loader = createFontLoader(sources, accept())
    expect(loader.fetches).toBe(false)
    expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
  }
  expect(createFontLoader({ korean: FONT }, accept()).fetches).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})

describe('the bound on a fetch', () => {
  /** Only the timers: reading a response body waits on the others. */
  const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

  test('is sixty seconds', () => {
    expect(FONT_FETCH_TIMEOUT_MS).toBe(60_000)
  })

  test('a fetch that never settles is missing for that call, not failed, and fetched again', async () => {
    fakeTimers()
    let signalSeen: AbortSignal | undefined
    const fetch = stubFetch()
    fetch.mockImplementationOnce((_url, init) => {
      signalSeen = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const register = accept()
    const loader = createFontLoader(
      { japanese: 'https://fonts.test/jp.otf', korean: 'https://fonts.test/ko.otf' },
      register
    )
    let settled = false
    const ensured = loader.ensure(['japanese', 'korean'])
    void ensured.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(FONT_FETCH_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    // The fetch was told to stop, and the call went on to the next key.
    expect(signalSeen?.aborted).toBe(true)
    expect(await ensured).toEqual(['japanese'])
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]?.[0]).toBe('korean')
    expect(vi.getTimerCount()).toBe(0)
    // Not failed: the next call fetches it again, and this time it arrives.
    expect(await loader.ensure(['japanese'])).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(register).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('the bound is applied to each fetch on its own', async () => {
    fakeTimers()
    const fetch = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(new Response(FONT))
          }, FONT_FETCH_TIMEOUT_MS - 1000)
        })
    )
    const loader = createFontLoader(
      { japanese: 'https://fonts.test/jp.otf', korean: 'https://fonts.test/ko.otf' },
      accept()
    )
    const ensured = loader.ensure(['japanese', 'korean'])
    await vi.advanceTimersByTimeAsync(FONT_FETCH_TIMEOUT_MS - 1000)
    // Reading the body takes real turns of the event loop before the second fetch starts.
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(FONT_FETCH_TIMEOUT_MS - 1000)
    expect(await ensured).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('the timer is cleared on success, on failure and on abort', async () => {
    fakeTimers()
    const fetch = stubFetch()
    const ok = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
    expect(await ok.ensure(['japanese'])).toEqual([])
    expect(vi.getTimerCount()).toBe(0)

    fetch.mockImplementation(() => Promise.resolve(new Response('', { status: 404 })))
    const notFound = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
    expect(await notFound.ensure(['japanese'])).toEqual(['japanese'])
    expect(vi.getTimerCount()).toBe(0)

    fetch.mockImplementation(() => Promise.reject(new TypeError('network down')))
    const down = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
    expect(await down.ensure(['japanese'])).toEqual(['japanese'])
    expect(vi.getTimerCount()).toBe(0)

    fetch.mockImplementation(() => new Promise<Response>(() => {}))
    const held = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
    const controller = new AbortController()
    const ensured = held.ensure(['japanese'], controller.signal)
    await vi.advanceTimersByTimeAsync(10)
    expect(vi.getTimerCount()).toBe(1)
    controller.abort()
    await expect(ensured).rejects.toMatchObject({ code: 'aborted' })
    expect(vi.getTimerCount()).toBe(0)
  })

  test('a 404 or a network error is still remembered as failed', async () => {
    fakeTimers()
    const fetch = stubFetch(() => Promise.reject(new TypeError('network down')))
    const loader = createFontLoader({ japanese: 'https://fonts.test/jp.otf' }, accept())
    expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
    expect(await loader.ensure(['japanese'])).toEqual(['japanese'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
