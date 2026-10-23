import {
  createMemorySignatureStore,
  type FieldsChange,
  type FieldValues,
  type FormAction,
  type InkError,
  type PdfAssets,
  type SignatureTemplate,
} from '@inkbar/core'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { useForm } from '../../src/hooks/useForm'

import { HookProbe } from './HookProbe'

/** `useForm()` on the page: its fields and values as attributes, and `set` and `reset` buttons. */
function FormProbe({ setTo }: { setTo?: FieldValues | undefined }) {
  const { fields, values, set, reset } = useForm()
  const [result, setResult] = useState('')
  return (
    <>
      <output
        data-testid="form"
        data-fields={fields.length}
        data-values={JSON.stringify(values)}
        data-result={result}
      />
      <button
        type="button"
        data-testid="form-set"
        onClick={() => {
          const r = set(setTo ?? { name: 'Set' })
          setResult(r ? JSON.stringify(r) : '')
        }}
      >
        set
      </button>
      <button type="button" data-testid="form-reset" onClick={() => reset()}>
        reset
      </button>
    </>
  )
}

export interface FormHarnessProps {
  src: string
  assets: PdfAssets
  /** Puts the fields under the harness's control, starting from `initial`. */
  controlled?: boolean
  initial?: FieldValues
  /** What the Push button sets the controlled value to. */
  push?: FieldValues
  /** What the Swap button opens next, and the controlled values it starts from. */
  swapTo?: { src: string; initial?: FieldValues }
  templates?: SignatureTemplate[]
  formHighlight?: boolean
  /** `onReady` throws once it has recorded `ready`, as a broken host's would. */
  throwOnReady?: boolean
  onFormAction?: (action: FormAction) => void
  onError?: (error: InkError) => void
  onChanged?: (next: FieldValues, change: FieldsChange) => void
}

/**
 * Records what the root reported, in order, in the page, where a test can read it in the same
 * task as the cause: `ready`, then each error's code.
 */
function record(entry: string): void {
  const w = window as Window & { __inkHeard?: string[] }
  ;(w.__inkHeard ??= []).push(entry)
}

/** A host that owns the values through `fields`, the way an app would. */
export function FormHarness({
  src: initialSrc,
  assets,
  controlled = false,
  initial = {},
  push = {},
  swapTo,
  templates = [],
  formHighlight,
  throwOnReady = false,
  onFormAction,
  onError,
  onChanged,
}: FormHarnessProps) {
  const [src, setSrc] = useState(initialSrc)
  const [values, setValues] = useState<FieldValues>(initial)
  const [heard, setHeard] = useState(0)
  const [store] = useState(() => createMemorySignatureStore(templates))
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={1}
      signatures={store}
      fields={controlled ? values : undefined}
      onFieldsChange={(next, change) => {
        setHeard((n) => n + 1)
        setValues(next)
        onChanged?.(next, change)
      }}
      formHighlight={formHighlight}
      onFormAction={onFormAction}
      onReady={() => {
        record('ready')
        if (throwOnReady) throw new Error('host onReady failed')
      }}
      onError={(e) => {
        record(e.code)
        onError?.(e)
      }}
    >
      <InkToolbar>
        <InkUndo />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <output
        data-testid="host-fields"
        data-values={JSON.stringify(values)}
        data-heard={heard}
      />
      <button
        type="button"
        data-testid="push"
        onClick={() => setValues((v) => ({ ...v, ...push }))}
      >
        push
      </button>
      <button
        type="button"
        data-testid="swap"
        onClick={() => {
          if (!swapTo) return
          setSrc(swapTo.src)
          setValues(swapTo.initial ?? {})
        }}
      >
        swap
      </button>
      <FormProbe />
      <HookProbe />
    </InkRoot>
  )
}

/**
 * The harness under development StrictMode, which mounts, unmounts and mounts every effect
 * again. The component-test runner's own root does not replay effects for a nested
 * `<StrictMode>`, so the tree gets a root of its own.
 */
export function StrictFormHost({ src, assets }: { src: string; assets: PdfAssets }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = createRoot(el.current!)
    root.render(
      <StrictMode>
        <FormHarness src={src} assets={assets} />
      </StrictMode>
    )
    return () => root.unmount()
  }, [src, assets])
  return <div ref={el} />
}
