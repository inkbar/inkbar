import { useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'

import { HookProbe } from './HookProbe'

import type { Annotation, PdfAssets } from '@inkbar/core'

/** A host that owns the list, the way an app would. */
export function ControlledHost({
  src,
  assets,
  history,
}: {
  src: string
  assets: PdfAssets
  history?: boolean
}) {
  const [list, setList] = useState<Annotation[]>([])
  return (
    <InkRoot
      src={src}
      assets={assets}
      annotations={list}
      onAnnotationsChange={setList}
      history={history}
    >
      <HookProbe />
      <output data-testid="host-count">{list.length}</output>
    </InkRoot>
  )
}
