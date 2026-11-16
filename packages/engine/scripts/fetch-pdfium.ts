import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Lock {
  version: string
  url: string
  sha256: string
}

const root = fileURLToPath(new URL('..', import.meta.url))

/** Throws when the bytes do not hash to `sha256`; the message names both hashes. */
export function verifyArchive(bytes: Uint8Array, sha256: string): void {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== sha256) {
    throw new Error(`PDFium archive hash mismatch: expected ${sha256}, got ${actual}`)
  }
}

/**
 * Puts the PDFium archive named by the lock file into `vendor/`. Set
 * `INKBAR_PDFIUM_ARCHIVE` to a local copy of the archive to skip the download;
 * the copy is verified against the same hash.
 */
export async function fetchPdfium(
  opts: { lockPath?: string; vendorDir?: string; fetch?: typeof fetch } = {}
): Promise<'fetched' | 'cached'> {
  const lockPath = opts.lockPath ?? join(root, 'pdfium.lock.json')
  const vendorDir = opts.vendorDir ?? join(root, 'vendor')
  const doFetch = opts.fetch ?? fetch
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Lock

  const stamp = join(vendorDir, '.sha256')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === lock.sha256)
    return 'cached'

  const local = process.env.INKBAR_PDFIUM_ARCHIVE
  let bytes: Uint8Array
  if (local) {
    try {
      bytes = readFileSync(local)
    } catch (error) {
      throw new Error(`Could not read INKBAR_PDFIUM_ARCHIVE at ${local}`, {
        cause: error,
      })
    }
  } else {
    const response = await doFetch(lock.url)
    if (!response.ok) {
      throw new Error(`Could not download ${lock.url}: HTTP ${response.status}`)
    }
    bytes = new Uint8Array(await response.arrayBuffer())
  }
  verifyArchive(bytes, lock.sha256)

  // Unpack beside the target, then rename, so a failed run leaves no half-written vendor/.
  const parent = dirname(vendorDir)
  mkdirSync(parent, { recursive: true })
  const work = mkdtempSync(join(parent, '.vendor-'))
  try {
    const archivePath = join(work, 'archive.tar.gz')
    const unpacked = join(work, 'unpacked')
    writeFileSync(archivePath, bytes)
    mkdirSync(unpacked)
    execFileSync('tar', ['-xzf', archivePath, '-C', unpacked])
    writeFileSync(join(unpacked, '.sha256'), `${lock.sha256}\n`)
    rmSync(vendorDir, { recursive: true, force: true })
    renameSync(unpacked, vendorDir)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  return 'fetched'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchPdfium().then(
    (result) => {
      console.log(`PDFium: ${result}`)
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  )
}
