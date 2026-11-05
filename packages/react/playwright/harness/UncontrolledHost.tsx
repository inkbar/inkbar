import { allTools } from '@inkbar/core/dom'
import { useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'

import { HookProbe } from './HookProbe'

import type { PdfAssets } from '@inkbar/core'

export function UncontrolledHost({ src, assets }: { src: string; assets: PdfAssets }) {
  const [tools] = useState(allTools)
  return (
    <InkRoot src={src} assets={assets} tools={tools}>
      <HookProbe />
    </InkRoot>
  )
}
