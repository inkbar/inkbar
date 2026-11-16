import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ARCHIVE_FILES, fetchPdfium, verifyArchive } from './fetch-pdfium.ts'

const FILES = [
  'inkbar-pdfium.wasm',
  'inkbar-pdfium.mjs',
  'exports.txt',
  'manifest.json',
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_LICENSES',
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

let dir: string
let archive: Uint8Array<ArrayBuffer>
let archivePath: string

beforeEach(() => {
  vi.stubEnv('INKBAR_PDFIUM_ARCHIVE', '')
  dir = mkdtempSync(join(tmpdir(), 'fetch-pdfium-'))
  const src = join(dir, 'src')
  mkdirSync(src)
  for (const name of FILES) writeFileSync(join(src, name), `content of ${name}\n`)
  archivePath = join(dir, 'archive.tar.gz')
  archive = pack(src, FILES)
})

function pack(src: string, names: string[]): Uint8Array<ArrayBuffer> {
  execFileSync('tar', ['-czf', archivePath, '-C', src, ...names])
  return Uint8Array.from(readFileSync(archivePath))
}

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

function writeLock(sha: string): string {
  const lockPath = join(dir, 'pdfium.lock.json')
  writeFileSync(
    lockPath,
    JSON.stringify({
      version: 'v1.1',
      url: 'https://example.test/pdfium.tar.gz',
      sha256: sha,
    })
  )
  return lockPath
}

const okFetch = (): typeof fetch => () =>
  Promise.resolve(new Response(new Blob([archive])))

test('verifyArchive accepts matching bytes', () => {
  const bytes = new TextEncoder().encode('abc')
  expect(() =>
    verifyArchive(
      bytes,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  ).not.toThrow()
})

test('verifyArchive rejects a mismatch and names both hashes', () => {
  expect(() => verifyArchive(new TextEncoder().encode('abc'), '0'.repeat(64))).toThrow(
    /0{64}.*ba7816bf/s
  )
})

test('fetchPdfium unpacks a verified archive and records its hash', async () => {
  const vendorDir = join(dir, 'vendor')
  const result = await fetchPdfium({
    lockPath: writeLock(sha256(archive)),
    vendorDir,
    fetch: okFetch(),
  })
  expect(result).toBe('fetched')
  for (const name of FILES) expect(existsSync(join(vendorDir, name))).toBe(true)
  expect(readFileSync(join(vendorDir, '.sha256'), 'utf8').trim()).toBe(sha256(archive))
})

test('fetchPdfium leaves vendor untouched when the hash is wrong', async () => {
  const vendorDir = join(dir, 'vendor')
  await expect(
    fetchPdfium({ lockPath: writeLock('0'.repeat(64)), vendorDir, fetch: okFetch() })
  ).rejects.toThrow(/0{64}/)
  expect(existsSync(join(vendorDir, '.sha256'))).toBe(false)
  expect(existsSync(vendorDir)).toBe(false)
})

test('fetchPdfium is cached when vendor/.sha256 matches the lock', async () => {
  const vendorDir = join(dir, 'vendor')
  const lockPath = writeLock(sha256(archive))
  await fetchPdfium({ lockPath, vendorDir, fetch: okFetch() })
  const throwing = (() => {
    throw new Error('fetch must not be called')
  }) as typeof fetch
  expect(await fetchPdfium({ lockPath, vendorDir, fetch: throwing })).toBe('cached')
})

test('fetchPdfium fails with the URL in the message when the download is not ok', async () => {
  const notFound = (() =>
    Promise.resolve(new Response('', { status: 404 }))) as typeof fetch
  await expect(
    fetchPdfium({
      lockPath: writeLock(sha256(archive)),
      vendorDir: join(dir, 'vendor'),
      fetch: notFound,
    })
  ).rejects.toThrow(/https:\/\/example\.test\/pdfium\.tar\.gz/)
})

test('fetchPdfium reads INKBAR_PDFIUM_ARCHIVE instead of downloading', async () => {
  vi.stubEnv('INKBAR_PDFIUM_ARCHIVE', archivePath)
  const throwing = (() => {
    throw new Error('fetch must not be called')
  }) as typeof fetch
  const vendorDir = join(dir, 'vendor')
  const result = await fetchPdfium({
    lockPath: writeLock(sha256(archive)),
    vendorDir,
    fetch: throwing,
  })
  expect(result).toBe('fetched')
  expect(existsSync(join(vendorDir, 'inkbar-pdfium.wasm'))).toBe(true)
})

test('fetchPdfium rejects a local archive with the wrong hash', async () => {
  vi.stubEnv('INKBAR_PDFIUM_ARCHIVE', archivePath)
  const vendorDir = join(dir, 'vendor')
  await expect(
    fetchPdfium({ lockPath: writeLock('0'.repeat(64)), vendorDir, fetch: okFetch() })
  ).rejects.toThrow(/0{64}/)
  expect(existsSync(vendorDir)).toBe(false)
})

test('fetchPdfium names the variable and path when the local archive is missing', async () => {
  const missing = join(dir, 'missing.tar.gz')
  vi.stubEnv('INKBAR_PDFIUM_ARCHIVE', missing)
  await expect(
    fetchPdfium({ lockPath: writeLock(sha256(archive)), vendorDir: join(dir, 'vendor') })
  ).rejects.toThrow(new RegExp(`INKBAR_PDFIUM_ARCHIVE.*${escape(missing)}`))
})

test('the archive holds seven files, the third-party licences among them', () => {
  expect([...ARCHIVE_FILES].sort()).toEqual([...FILES].sort())
})

test('fetchPdfium rejects an archive that lacks a file and leaves vendor untouched', async () => {
  const partial = pack(join(dir, 'src'), FILES.slice(0, -1))
  const vendorDir = join(dir, 'vendor')
  await expect(
    fetchPdfium({
      lockPath: writeLock(sha256(partial)),
      vendorDir,
      fetch: () => Promise.resolve(new Response(new Blob([partial]))),
    })
  ).rejects.toThrow(/THIRD_PARTY_LICENSES/)
  expect(existsSync(vendorDir)).toBe(false)
})

test('fetchPdfium fetches again when a file is missing from vendor', async () => {
  const vendorDir = join(dir, 'vendor')
  const lockPath = writeLock(sha256(archive))
  await fetchPdfium({ lockPath, vendorDir, fetch: okFetch() })
  rmSync(join(vendorDir, 'inkbar-pdfium.wasm'))
  expect(await fetchPdfium({ lockPath, vendorDir, fetch: okFetch() })).toBe('fetched')
  expect(existsSync(join(vendorDir, 'inkbar-pdfium.wasm'))).toBe(true)
})
