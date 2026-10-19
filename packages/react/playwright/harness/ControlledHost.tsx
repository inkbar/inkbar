import { useEffect, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useDocument } from '../../src/hooks/useDocument'

import { HookProbe } from './HookProbe'

import type { Annotation, PdfAssets } from '@inkbar/core'

/** Adds one note from a passive effect once the document is ready. */
function AddOnReady() {
  const { isReady } = useDocument()
  const { add } = useAnnotations()
  useEffect(() => {
    if (isReady)
      add({ type: 'text', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
    // Once per ready transition; `add` is not a dependency worth re-running for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady])
  return null
}

/** A host that owns the list, the way an app would. */
export function ControlledHost({
  src,
  assets,
  history,
  addOnReady = false,
  spreadOnRender = false,
}: {
  src: string
  assets: PdfAssets
  history?: boolean
  addOnReady?: boolean
  /** Pass a new array with the same content on every render. */
  spreadOnRender?: boolean
}) {
  const [list, setList] = useState<Annotation[]>([])
  const [bumps, setBumps] = useState(0)
  return (
    <InkRoot
      src={src}
      assets={assets}
      annotations={spreadOnRender ? [...list] : list}
      onAnnotationsChange={setList}
      history={history}
    >
      <HookProbe />
      {addOnReady ? <AddOnReady /> : null}
      <output data-testid="host-count">{list.length}</output>
      <button type="button" data-testid="bump" onClick={() => setBumps((n) => n + 1)}>
        {bumps}
      </button>
    </InkRoot>
  )
}
