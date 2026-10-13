import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { InkRoot } from '../../src/components/InkRoot'

import type { PdfAssets } from '@inkbar/core'

function Tree({ src, assets }: { src: string; assets: PdfAssets }) {
  const [ready, setReady] = useState(0)
  const [errors, setErrors] = useState(0)
  return (
    <InkRoot
      src={src}
      assets={assets}
      onReady={() => setReady((n) => n + 1)}
      onError={() => setErrors((n) => n + 1)}
    >
      <output data-testid="ready-count">{ready}</output>
      <output data-testid="error-count">{errors}</output>
    </InkRoot>
  )
}

/**
 * Development StrictMode: every effect mounts, unmounts and mounts again. The component-test
 * runner's own root does not replay effects for a nested `<StrictMode>`, so the tree gets a
 * root of its own.
 */
export function StrictHost({ src, assets }: { src: string; assets: PdfAssets }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = createRoot(el.current!)
    root.render(
      <StrictMode>
        <Tree src={src} assets={assets} />
      </StrictMode>
    )
    return () => root.unmount()
  }, [src, assets])
  return <div ref={el} />
}
