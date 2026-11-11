/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- typed lint cannot resolve .vue types; vue-tsc checks this file. */
import { describe, expect, it } from 'vitest'

import type InkRoot from './components/InkRoot.vue'

type Props = InstanceType<typeof InkRoot>['$props']
type Emits = InstanceType<typeof InkRoot>['$emit']

// `pnpm typecheck` covers this file: each `@ts-expect-error` fails the build if its prop or
// event comes back.
describe('removed 0.12.0 deprecations are gone', () => {
  it('InkRoot no longer takes the old prop or emits the old event', () => {
    const base = { src: 'a.pdf', assets: {} } as unknown as Props
    const withSignatures: Props = {
      ...base,
      // @ts-expect-error `signatures` is gone: pass `storage`.
      signatures: {},
    }
    const emit = (() => undefined) as unknown as Emits
    // @ts-expect-error `form-action` is gone: listen for `action`.
    emit('form-action', { kind: 'print' })
    expect(withSignatures).toBeDefined()
  })
})
