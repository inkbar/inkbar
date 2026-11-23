import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { pinPdfium } from './pin-pdfium.ts'

const TAG = 'v8165.7'
const NAME = `inkbar-pdfium-wasm32-${TAG}.tar.gz`
const URL_OF_ASSET = `https://github.com/inkbar/pdfium/releases/download/${TAG}/${NAME}`
const BYTES = new TextEncoder().encode('an archive')
const HASH = createHash('sha256').update(BYTES).digest('hex')
const OLD = {
  version: 'v8165.6',
  url: 'https://github.com/inkbar/pdfium/releases/download/v8165.6/inkbar-pdfium-wasm32-v8165.6.tar.gz',
  sha256: '1'.repeat(64),
}
const OLD_TEXT = `${JSON.stringify(OLD, null, 2)}\n`

let dir: string
let lockPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pin-pdfium-'))
  lockPath = join(dir, 'pdfium.lock.json')
  writeFileSync(lockPath, OLD_TEXT)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

/** A fetch that answers the release lookup with `release` and the asset URL with the bytes. */
function fakeFetch(release: Response, calls: string[] = []): typeof fetch {
  return ((input: string | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://api.github.com/')) return Promise.resolve(release.clone())
    if (url === URL_OF_ASSET) return Promise.resolve(new Response(new Blob([BYTES])))
    return Promise.resolve(new Response('', { status: 404 }))
  }) as typeof fetch
}

const withDigest = (digest: string | undefined) =>
  json({ tag_name: TAG, assets: [{ name: NAME, digest }] })

const unchanged = () => expect(readFileSync(lockPath, 'utf8')).toBe(OLD_TEXT)

test('pinPdfium writes the lock from the asset digest', async () => {
  const calls: string[] = []
  const lock = await pinPdfium(TAG, {
    lockPath,
    fetch: fakeFetch(withDigest(`sha256:${HASH}`), calls),
  })
  expect(lock).toEqual({ version: TAG, url: URL_OF_ASSET, sha256: HASH })
  expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(lock)
  expect(calls).toEqual([
    `https://api.github.com/repos/inkbar/pdfium/releases/tags/${TAG}`,
  ])
})

test('pinPdfium hashes the download when the asset has no digest', async () => {
  const calls: string[] = []
  const lock = await pinPdfium(TAG, {
    lockPath,
    fetch: fakeFetch(withDigest(undefined), calls),
  })
  expect(lock.sha256).toBe(HASH)
  expect(calls).toContain(URL_OF_ASSET)
  expect((JSON.parse(readFileSync(lockPath, 'utf8')) as typeof OLD).sha256).toBe(HASH)
})

test('pinPdfium writes the file in the format the lock already has', async () => {
  const real = readFileSync(
    fileURLToPath(new URL('../pdfium.lock.json', import.meta.url)),
    'utf8'
  )
  const { version, url, sha256 } = JSON.parse(real) as typeof OLD
  writeFileSync(lockPath, OLD_TEXT)
  const asset = `inkbar-pdfium-wasm32-${version}.tar.gz`
  const release = json({
    assets: [{ name: asset, digest: `sha256:${sha256}` }],
  })
  await pinPdfium(version, { lockPath, fetch: fakeFetch(release) })
  expect(url).toBe(
    `https://github.com/inkbar/pdfium/releases/download/${version}/${asset}`
  )
  expect(readFileSync(lockPath, 'utf8')).toBe(real)
})

test('pinPdfium rejects a tag of the wrong shape without fetching', async () => {
  const throwing = (() => {
    throw new Error('fetch must not be called')
  }) as typeof fetch
  for (const tag of ['8165.7', 'v8165', 'v8165.7.1', 'v8165.x', ' v8165.7', 'main'])
    await expect(pinPdfium(tag, { lockPath, fetch: throwing })).rejects.toThrow(
      /v<chromium branch>\.<n>/
    )
  unchanged()
})

test('pinPdfium says the release may not be published yet when there is none', async () => {
  await expect(
    pinPdfium(TAG, { lockPath, fetch: fakeFetch(json({}, 404)) })
  ).rejects.toThrow(/no release v8165\.7.*not be published yet/)
  unchanged()
})

test('pinPdfium names the status of any other failed lookup', async () => {
  await expect(
    pinPdfium(TAG, { lockPath, fetch: fakeFetch(json({}, 403)) })
  ).rejects.toThrow(/HTTP 403.*limiting requests.*GITHUB_TOKEN/)
  unchanged()
})

test('pinPdfium rejects a release without the expected asset', async () => {
  const release = json({ assets: [{ name: 'something-else.tar.gz' }] })
  await expect(pinPdfium(TAG, { lockPath, fetch: fakeFetch(release) })).rejects.toThrow(
    new RegExp(NAME.replace(/\./g, '\\.'))
  )
  unchanged()
})

test('pinPdfium rejects a digest that is not 64 hex characters', async () => {
  for (const digest of ['sha256:abc', `sha256:${'g'.repeat(64)}`, `md5:${HASH}`, HASH])
    await expect(
      pinPdfium(TAG, { lockPath, fetch: fakeFetch(withDigest(digest)) })
    ).rejects.toThrow(/digest/)
  unchanged()
})

test('pinPdfium reports a network failure', async () => {
  const failing = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch
  await expect(pinPdfium(TAG, { lockPath, fetch: failing })).rejects.toThrow(
    /Could not reach api\.github\.com/
  )
  unchanged()
})

test('pinPdfium reports a failed download when it has to hash the asset', async () => {
  const failingDownload = ((input: string | URL) =>
    String(input).startsWith('https://api.github.com/')
      ? Promise.resolve(withDigest(undefined))
      : Promise.resolve(new Response('', { status: 500 }))) as typeof fetch
  await expect(pinPdfium(TAG, { lockPath, fetch: failingDownload })).rejects.toThrow(
    /HTTP 500/
  )
  unchanged()
})

test('pinPdfium sends a generic User-Agent and a token only when one is set', async () => {
  const seen: Array<Record<string, string>> = []
  const spy = ((_: unknown, init?: RequestInit) => {
    seen.push({ ...(init?.headers as Record<string, string>) })
    return Promise.resolve(withDigest(`sha256:${HASH}`))
  }) as typeof fetch
  vi.stubEnv('GITHUB_TOKEN', '')
  await pinPdfium(TAG, { lockPath, fetch: spy })
  vi.stubEnv('GITHUB_TOKEN', 'abc')
  await pinPdfium(TAG, { lockPath, fetch: spy })
  expect(seen[0]?.['User-Agent']).toBe('inkbar-engine-scripts')
  expect(seen[0]).not.toHaveProperty('Authorization')
  expect(seen[1]?.Authorization).toBe('Bearer abc')
})

test('pinPdfium sends the token to the API only, not to the asset download', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'abc')
  const seen: Array<[string, Record<string, string>]> = []
  const spy = ((input: string | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push([url, { ...(init?.headers as Record<string, string>) }])
    return Promise.resolve(
      url.startsWith('https://api.github.com/')
        ? withDigest(undefined)
        : new Response(new Blob([BYTES]))
    )
  }) as typeof fetch
  await pinPdfium(TAG, { lockPath, fetch: spy })
  expect(seen).toHaveLength(2)
  expect(seen[0]?.[1].Authorization).toBe('Bearer abc')
  expect(seen[1]?.[0]).toBe(URL_OF_ASSET)
  expect(seen[1]?.[1]).not.toHaveProperty('Authorization')
})

test('pinPdfium leaves the lock unchanged and no temp file when the write fails', async () => {
  const failing = ((path: string) => {
    writeFileSync(path, '{"partial')
    throw new Error('disk full')
  }) as typeof writeFileSync
  await expect(
    pinPdfium(TAG, {
      lockPath,
      fetch: fakeFetch(withDigest(`sha256:${HASH}`)),
      writeFile: failing,
    })
  ).rejects.toThrow(/disk full/)
  unchanged()
  expect(readdirSync(dir)).toEqual(['pdfium.lock.json'])
})
