import { useEffect, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

export function EventHost({
  src,
  assets,
  password,
  bytesFrom,
}: {
  src: DocumentSource | null
  assets: PdfAssets
  password?: string | undefined
  /** Fetches this URL in the page and passes the bytes as the source, one array for every open. */
  bytesFrom?: string | undefined
}) {
  // Playwright serialises callback arguments without an Error's own properties, so the host
  // records the codes in the DOM where the test can read them.
  const [codes, setCodes] = useState<string[]>([])
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [byteLength, setByteLength] = useState<number | null>(null)

  useEffect(() => {
    if (bytesFrom === undefined) return
    let cancelled = false
    void fetch(bytesFrom)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        if (!cancelled) setBytes(new Uint8Array(buf))
      })
    return () => {
      cancelled = true
    }
  }, [bytesFrom])

  return (
    <InkRoot
      src={bytesFrom === undefined ? src : bytes}
      assets={assets}
      password={password}
      onError={(e) => {
        setCodes((c) => [...c, e.code])
        setByteLength(bytes?.byteLength ?? null)
      }}
      onReady={() => setByteLength(bytes?.byteLength ?? null)}
    >
      <output data-testid="error-codes">{codes.join(',')}</output>
      <output data-testid="byte-length">{byteLength ?? ''}</output>
    </InkRoot>
  )
}
