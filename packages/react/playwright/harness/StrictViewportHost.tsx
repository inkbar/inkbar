import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

import { InkRoot } from '../../src/components/InkRoot'
import { InkViewport } from '../../src/components/InkViewport'

import type { PdfAssets } from '@inkbar/core'

function Tree({ src, assets }: { src: string; assets: PdfAssets }) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 700, width: 900 }}>
        <InkViewport
          buffer={0}
          renderAnnotation={({ annotation }) => (
            <span className="my-pin" data-type={annotation.type}>
              Pin
            </span>
          )}
        />
      </div>
    </InkRoot>
  )
}

/**
 * Development StrictMode for the viewport: every effect mounts, unmounts and mounts again, so
 * the viewport is built, torn down and built once more before the first paint settles. The
 * component-test runner's own root does not replay effects for a nested `<StrictMode>`, so the
 * tree gets a root of its own.
 */
export function StrictViewportHost({ src, assets }: { src: string; assets: PdfAssets }) {
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
