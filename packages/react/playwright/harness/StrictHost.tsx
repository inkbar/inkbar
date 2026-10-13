import { StrictMode, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'

import type { PdfAssets } from '@inkbar/core'

/** Development StrictMode: every effect mounts, unmounts and mounts again. */
export function StrictHost({ src, assets }: { src: string; assets: PdfAssets }) {
  const [ready, setReady] = useState(0)
  const [errors, setErrors] = useState(0)
  return (
    <StrictMode>
      <InkRoot
        src={src}
        assets={assets}
        onReady={() => setReady((n) => n + 1)}
        onError={() => setErrors((n) => n + 1)}
      >
        <output data-testid="ready-count">{ready}</output>
        <output data-testid="error-count">{errors}</output>
      </InkRoot>
    </StrictMode>
  )
}
