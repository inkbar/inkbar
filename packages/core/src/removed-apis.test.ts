import { describe, expect, it } from 'vitest'

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
