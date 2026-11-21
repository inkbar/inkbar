import { createHash } from 'node:crypto'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Lock {
  version: string
  url: string
  sha256: string
}

interface Release {
  assets?: Array<{ name?: string; digest?: string | null }>
}

const root = fileURLToPath(new URL('..', import.meta.url))
const REPO = 'inkbar/pdfium'

function headers(): Record<string, string> {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'inkbar-engine-scripts',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) result.Authorization = `Bearer ${token}`
  return result
}

/**
 * Pins the released PDFium build `tag` (such as `v8165.7`): reads the release from GitHub and
 * writes its version, download URL and SHA-256 to the lock file. The hash comes from the
 * asset's `digest`; an asset without one is downloaded and hashed. The lock file is written
 * only when every step has worked.
 */
export async function pinPdfium(
  tag: string,
  opts: {
    lockPath?: string
    fetch?: typeof fetch
    writeFile?: typeof writeFileSync
  } = {}
): Promise<Lock> {
  const lockPath = opts.lockPath ?? join(root, 'pdfium.lock.json')
  const doFetch = opts.fetch ?? fetch
  const write = opts.writeFile ?? writeFileSync

  if (!/^v\d+\.\d+$/.test(tag))
    throw new Error(
      `"${tag}" is not a release tag: expected v<chromium branch>.<n>, such as v8165.7`
    )

  const assetName = `inkbar-pdfium-wasm32-${tag}.tar.gz`
  const url = `https://github.com/${REPO}/releases/download/${tag}/${assetName}`

  async function get(address: string, init?: RequestInit): Promise<Response> {
    const host = new URL(address).host
    try {
      return await doFetch(address, init)
    } catch (error) {
      throw new Error(`Could not reach ${host}`, { cause: error })
    }
  }

  const lookup = `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
  const response = await get(lookup, { headers: headers() })
  if (response.status === 404)
    throw new Error(`${REPO} has no release ${tag}; it may not be published yet`)
  if (!response.ok)
    throw new Error(
      `Could not read ${lookup}: HTTP ${response.status}. GitHub may be limiting requests; setting GITHUB_TOKEN raises the limit`
    )
  const release = (await response.json()) as Release

  const asset = release.assets?.find((item) => item.name === assetName)
  if (!asset) throw new Error(`Release ${tag} has no asset named ${assetName}`)

  let sha256: string
  if (asset.digest) {
    const match = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest)
    if (!match?.[1])
      throw new Error(
        `The digest of ${assetName} is not sha256 followed by 64 hex characters: ${asset.digest}`
      )
    sha256 = match[1].toLowerCase()
  } else {
    const download = await get(url, {
      headers: { 'User-Agent': 'inkbar-engine-scripts' },
    })
    if (!download.ok)
      throw new Error(`Could not download ${url}: HTTP ${download.status}`)
    sha256 = createHash('sha256')
      .update(new Uint8Array(await download.arrayBuffer()))
      .digest('hex')
  }

  const lock: Lock = { version: tag, url, sha256 }
  // Written beside the lock, then renamed over it, so a failed write leaves the lock as it was.
  const temp = `${lockPath}.${process.pid}.tmp`
  try {
    write(temp, `${JSON.stringify(lock, null, 2)}\n`)
    renameSync(temp, lockPath)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
  return lock
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2]
  if (!tag) {
    console.error('Usage: node scripts/pin-pdfium.ts v<chromium branch>.<n>')
    process.exit(1)
  }
  pinPdfium(tag).then(
    (lock) => {
      console.log(`PDFium: pinned ${lock.version} (${lock.sha256})`)
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  )
}
