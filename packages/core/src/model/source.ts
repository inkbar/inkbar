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
