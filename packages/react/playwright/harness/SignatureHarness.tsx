import {
  createMemorySignatureStore,
  type DocumentSource,
  type PdfAssets,
  type SignatureOptions,
  type SignatureStore,
  type SignatureTemplate,
} from '@inkbar/core'
import { useMemo, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { InkSignatureMenu } from '../../src/components/InkSignatureMenu'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkViewport } from '../../src/components/InkViewport'
import { useToolOptions } from '../../src/hooks/useToolOptions'

import { HookProbe } from './HookProbe'

/** The signature tool's chosen template, for assertions. */
function OptionsProbe() {
  const [options] = useToolOptions<SignatureOptions>('signature')
  return (
    <output data-testid="signature-options" data-template={options.templateId ?? ''} />
  )
}

/** A viewer with the signature menu over a memory store whose contents the page shows. */
export function SignatureHarness({
  src,
  assets,
  initial = [],
  fonts,
  failSave = false,
}: {
  src: DocumentSource
  assets: PdfAssets
  initial?: SignatureTemplate[]
  fonts?: string[]
  /** The store refuses every save, as a full one would. */
  failSave?: boolean
}) {
  const [saved, setSaved] = useState<SignatureTemplate[]>(initial)
  const store = useMemo<SignatureStore>(() => {
    const inner = createMemorySignatureStore(initial)
    const sync = async () => setSaved(await inner.list())
    return {
      list: () => inner.list(),
      save: async (t) => {
        if (failSave) throw new Error('full')
        await inner.save(t)
        await sync()
      },
      remove: async (id) => {
        await inner.remove(id)
        await sync()
      },
    }
    // The store is made once, from the first `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <InkRoot src={src} assets={assets} zoom={1} signatures={store} signatureFonts={fonts}>
      <InkToolbar>
        <InkToolButton tool="select" />
        <InkSignatureMenu />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <output
        data-testid="signature-store"
        data-count={saved.length}
        data-ids={saved.map((t) => t.id).join(',')}
        data-kinds={saved.map((t) => t.kind).join(',')}
      />
      <OptionsProbe />
      <HookProbe />
    </InkRoot>
  )
}
