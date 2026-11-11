import {
  createMemoryStorage,
  type DocumentSource,
  type InkStorage,
  type PdfAssets,
  type SignatureOptions,
  type SignatureTemplate,
} from '@inkbar/core'
import { allTools } from '@inkbar/core/dom'
import { useMemo, useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { InkSignatureDialog } from '../../src/components/InkSignatureDialog'
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

/** A viewer with the signature menu over a memory storage whose templates the page shows. */
export function SignatureHarness({
  src,
  assets,
  initial = [],
  fonts,
  failSave = false,
  failRemove = false,
  bare = false,
}: {
  src: DocumentSource
  assets: PdfAssets
  initial?: SignatureTemplate[]
  fonts?: string[]
  /** Storage refuses every save, as a full one would. */
  failSave?: boolean
  /** Storage refuses every removal. */
  failRemove?: boolean
  /** No tools: a plain button opens the dialog in place of the menu. */
  bare?: boolean
}) {
  const [tools] = useState(allTools)
  const [dialog, setDialog] = useState(false)
  const [saved, setSaved] = useState<SignatureTemplate[]>(initial)
  const storage = useMemo<InkStorage>(() => {
    const inner = createMemoryStorage({ signatures: initial })
    const read = async () =>
      ((await inner.get('signatures')) ?? []) as SignatureTemplate[]
    return {
      get: (key) => inner.get(key),
      set: async (key, value) => {
        if (key === 'signatures') {
          const before = await read()
          const after = value as SignatureTemplate[]
          if (failSave && after.length > before.length) throw new Error('full')
          if (failRemove && after.length < before.length) throw new Error('full')
          await inner.set(key, value)
          setSaved(await read())
          return
        }
        await inner.set(key, value)
      },
      remove: (key) => inner.remove(key),
    }
    // The storage is made once, from the first `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={1}
      storage={storage}
      signatureFonts={fonts}
      tools={bare ? undefined : tools}
    >
      <InkToolbar>
        <InkToolButton tool="select" />
        {bare ? (
          <button type="button" onClick={() => setDialog(true)}>
            Open dialog
          </button>
        ) : (
          <InkSignatureMenu />
        )}
      </InkToolbar>
      {bare ? <InkSignatureDialog open={dialog} onOpenChange={setDialog} /> : null}
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
      {bare ? null : <OptionsProbe />}
      <HookProbe />
    </InkRoot>
  )
}
