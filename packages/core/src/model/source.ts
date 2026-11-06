import { v7 as uuidv7 } from 'uuid'

import { InkError } from './errors'

export type DocumentSource =
  | ArrayBuffer
  | Uint8Array
  | Blob
  | string
  | { url: string; key: string }
  | { data: ArrayBuffer | Uint8Array; key: string }

export interface ResolvedSource {
  /** Identity of the document. Hosts reuse it to avoid reloads when a signed URL changes. */
  key: string
  bytes(): Promise<Uint8Array>
}

export function resolveSource(
  src: DocumentSource,
  fetchImpl: typeof fetch = globalThis.fetch
): ResolvedSource {
  if (typeof src === 'string')
    return { key: src, bytes: () => fetchBytes(src, fetchImpl) }
  if (src instanceof ArrayBuffer || src instanceof Uint8Array) {
    const data = toBytes(src)
    return { key: `bytes:${uuidv7()}`, bytes: () => Promise.resolve(data.slice()) }
  }
  if ('url' in src) {
    const { url } = src
    return { key: src.key, bytes: () => fetchBytes(url, fetchImpl) }
  }
  if ('data' in src) {
    const data = toBytes(src.data)
    return { key: src.key, bytes: () => Promise.resolve(data.slice()) }
  }
  const blob = src
  return {
    key: `bytes:${uuidv7()}`,
    bytes: async () => new Uint8Array(await blob.arrayBuffer()),
  }
}

const DEFAULT_FILE_NAME = 'document.pdf'

/** `name` ending in `.pdf` (any case), else with it added. */
const asPdf = (name: string): string => (/\.pdf$/i.test(name) ? name : `${name}.pdf`)

/** A URL's last path segment, decoded, without its query or hash; null when it has none. */
function urlFileName(url: string): string | null {
  let path: string
  try {
    path = new URL(url, 'http://localhost').pathname
  } catch {
    return null
  }
  const last = path.split('/').pop() ?? ''
  if (last === '') return null
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/**
 * The name to save `src` under: a File's name, else a URL's last path segment, with `.pdf`
 * added when it has none; `document.pdf` when neither gives one.
 */
export function sourceFileName(src: DocumentSource): string {
  let name: string | null = null
  if (typeof src === 'string') name = urlFileName(src)
  else if (src instanceof ArrayBuffer || src instanceof Uint8Array) name = null
  else if ('url' in src) name = urlFileName(src.url)
  else if ('data' in src) name = null
  else if (typeof (src as Partial<File>).name === 'string') name = (src as File).name
  return name ? asPdf(name) : DEFAULT_FILE_NAME
}

/**
 * A view over the host's bytes. `bytes()` hands PDF.js a copy each time: PDF.js transfers the
 * buffer it is given to its worker, which would empty the host's array and break a reopen
 * (a password retry, for one).
 */
function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  if (typeof fetchImpl !== 'function') {
    throw new InkError(
      'SourceFetchFailed',
      'No fetch implementation available for URL sources',
      {
        url,
      }
    )
  }
  let res: Response
  try {
    res = await fetchImpl(url, { credentials: 'same-origin' })
  } catch (cause) {
    throw new InkError('SourceFetchFailed', `Could not fetch ${url}`, { url }, cause)
  }
  if (!res.ok) {
    throw new InkError(
      'SourceFetchFailed',
      `Fetching ${url} returned HTTP ${res.status}`,
      {
        url,
        status: res.status,
      }
    )
  }
  try {
    return new Uint8Array(await res.arrayBuffer())
  } catch (cause) {
    throw new InkError(
      'SourceFetchFailed',
      `Reading the body of ${url} failed`,
      { url },
      cause
    )
  }
}
