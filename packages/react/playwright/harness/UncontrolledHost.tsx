import { InkRoot } from '../../src/components/InkRoot'

import { HookProbe } from './HookProbe'

import type { PdfAssets } from '@inkbar/core'

export function UncontrolledHost({ src, assets }: { src: string; assets: PdfAssets }) {
  return (
    <InkRoot src={src} assets={assets}>
      <HookProbe />
    </InkRoot>
  )
}
