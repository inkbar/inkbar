import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { createTestPlugin, type Mark } from '../../../core/src/test-support/plugin'
import { InkCommand } from '../../src/components/InkCommand'
import { InkRedo } from '../../src/components/InkRedo'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { useAnnotations } from '../../src/hooks/useAnnotations'
import { useCommand } from '../../src/hooks/useCommand'
import { useHistory } from '../../src/hooks/useHistory'
import { useReadable } from '../../src/use-readable'

import type {
  Annotation,
  DocumentSource,
  PdfAssets,
  Readable,
  RecordStore,
} from '@inkbar/core'

const NO_MARKS: readonly Mark[] = []

function PluginControls({
  marks,
  finish,
}: {
  marks: () => Readable<RecordStore<Mark> | null>
  finish: () => void
}) {
  const { annotations, remove } = useAnnotations()
  const { canUndo } = useHistory()
  const store = useReadable(marks(), null)
  const list = useReadable(store?.list, NO_MARKS)
  const accept = useCommand('sandbox.accept')
  return (
    <>
      <InkToolbar>
        <InkCommand id="sandbox.accept" />
        <InkCommand id="sandbox.work" />
        <InkToolButton tool="sandbox.stamp" />
        <InkUndo />
        <InkRedo />
      </InkToolbar>
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <div
        data-testid="probe"
        data-annotations={annotations.length}
        data-marks={list.map((m) => m.status).join(',')}
        data-can-undo={String(canUndo)}
        data-accept-enabled={String(accept.enabled)}
        data-accept-label={accept.label}
      >
        <button
          type="button"
          data-testid="remove"
          onClick={() => {
            const id = list.find((m) => m.id === 'm1')?.annotationId
            if (id) remove(id)
          }}
        >
          remove
        </button>
        <button type="button" data-testid="finish" onClick={finish}>
          finish
        </button>
      </div>
    </>
  )
}

interface PluginHarnessProps {
  src: DocumentSource
  assets: PdfAssets
  /** Owns the annotations through `annotations` and `onAnnotationsChange`. */
  controlled?: boolean
  history?: boolean
}

/** Plugins hold functions, which a component test cannot pass as props: the harness builds one. */
export function PluginHarness({
  src,
  assets,
  controlled = false,
  history,
  onSetup,
}: PluginHarnessProps & { onSetup?: () => void }) {
  const [{ plugin, marks, finish }] = useState(() => createTestPlugin({ onSetup }))
  const [plugins] = useState(() => [plugin])
  const [list, setList] = useState<Annotation[]>([])
  return controlled ? (
    <InkRoot
      src={src}
      assets={assets}
      annotations={list}
      onAnnotationsChange={setList}
      history={history}
      plugins={plugins}
    >
      <PluginControls marks={marks} finish={finish} />
      <output data-testid="host-count">{list.length}</output>
    </InkRoot>
  ) : (
    <InkRoot src={src} assets={assets} plugins={plugins}>
      <PluginControls marks={marks} finish={finish} />
    </InkRoot>
  )
}

/**
 * The harness under development StrictMode, in a root of its own (see StrictHost), with a count
 * of the times the plugin was set up.
 */
export function StrictPluginHost(props: PluginHarnessProps) {
  const el = useRef<HTMLDivElement>(null)
  const [setups, setSetups] = useState(0)
  useEffect(() => {
    let count = 0
    const root = createRoot(el.current!)
    root.render(
      <StrictMode>
        <PluginHarness
          {...props}
          onSetup={() => queueMicrotask(() => setSetups(++count))}
        />
      </StrictMode>
    )
    return () => root.unmount()
    // The props are fixed for a test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <output data-testid="setups">{setups}</output>
      <div ref={el} />
    </>
  )
}
