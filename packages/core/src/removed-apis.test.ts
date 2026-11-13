import { describe, expect, it } from 'vitest'

import type {
  // @ts-expect-error COLOR_LABELS is gone: use messages.
  COLOR_LABELS,
  // @ts-expect-error FORM_LABELS is gone: use messages.
  FORM_LABELS,
  // @ts-expect-error MARKUP_LABELS is gone: use messages.
  MARKUP_LABELS,
  // @ts-expect-error PASSWORD_LABELS is gone: use messages.
  PASSWORD_LABELS,
  // @ts-expect-error SHAPE_LABELS is gone: use messages.
  SHAPE_LABELS,
  // @ts-expect-error SIGNATURE_LABELS is gone: use messages.
  SIGNATURE_LABELS,
  // @ts-expect-error TOOL_LABELS is gone: use messages.
  TOOL_LABELS,
} from './dom'
import type { CreateViewerOptions } from './dom/viewer/create-viewer'
import type { MountViewerOptions } from './dom/viewer-engine'
// @ts-expect-error `FormAction` is gone: use `ViewerAction`.
import type { FormAction } from './index'
import type { SignatureStore } from './model/signatures'

// `pnpm typecheck` covers this file: each `@ts-expect-error` fails the build if its name or
// option comes back.
describe('removed 0.12.0 deprecations are gone', () => {
  it('no longer accepts the old options', () => {
    const store = {} as SignatureStore
    const create: CreateViewerOptions = {
      // @ts-expect-error `signatures` is gone: pass `storage`.
      signatures: store,
    }
    const mount: MountViewerOptions = {
      // @ts-expect-error `signatures` is gone: pass `storage`.
      signatures: store,
    }
    const action: CreateViewerOptions = {
      // @ts-expect-error `onFormAction` is gone: use `onAction`.
      onFormAction: () => undefined,
    }
    const mountAction: MountViewerOptions = {
      // @ts-expect-error `onFormAction` is gone: use `onAction`.
      onFormAction: () => undefined,
    }
    expect([create, mount, action, mountAction]).toHaveLength(4)
  })

  it('no longer exports the FormAction type', () => {
    const action: FormAction = { kind: 'print' }
    expect(action).toEqual({ kind: 'print' })
  })

  it('no longer exports the old helpers', async () => {
    const entry = await import('./index')
    // @ts-expect-error `createLocalSignatureStore` is gone: use `storage` with `createLocalStorage()`.
    expect(entry.createLocalSignatureStore).toBeUndefined()
    // @ts-expect-error `createRawLocalStorage` was internal and is gone.
    expect(entry.createRawLocalStorage).toBeUndefined()
    expect(entry.createStorageSignatureStore).toBeTypeOf('function')
  })
})

/** The tables by name, so each import above is read. */
type GoneTables = [
  typeof COLOR_LABELS,
  typeof FORM_LABELS,
  typeof MARKUP_LABELS,
  typeof PASSWORD_LABELS,
  typeof SHAPE_LABELS,
  typeof SIGNATURE_LABELS,
  typeof TOOL_LABELS,
]

describe('label tables are gone', () => {
  it('no longer exports them from the dom entry', async () => {
    const entry: Record<string, unknown> = await import('./dom')
    const names = [
      'COLOR_LABELS',
      'FORM_LABELS',
      'MARKUP_LABELS',
      'PASSWORD_LABELS',
      'SHAPE_LABELS',
      'SIGNATURE_LABELS',
      'TOOL_LABELS',
    ] as const satisfies { length: GoneTables['length'] }
    for (const name of names) expect(entry[name]).toBeUndefined()
    expect(entry.createMessageState).toBeTypeOf('function')
  })
})
