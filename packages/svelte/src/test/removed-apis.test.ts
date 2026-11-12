import { describe, expect, it } from 'vitest'

import type InkRoot from '../lib/components/InkRoot.svelte'
import type { ComponentProps } from 'svelte'

type Props = ComponentProps<typeof InkRoot>

// `pnpm typecheck` covers this file: each `@ts-expect-error` fails the check if its prop comes
// back.
describe('removed 0.12.0 deprecations are gone', () => {
  it('InkRoot no longer takes the old props', () => {
    const base = { src: 'a.pdf', assets: {} } as unknown as Props
    const withSignatures: Props = {
      ...base,
      // @ts-expect-error `signatures` is gone: pass `storage`.
      signatures: {},
    }
    const withFormAction: Props = {
      ...base,
      // @ts-expect-error `onformaction` is gone: use `onaction`.
      onformaction: () => undefined,
    }
    expect([withSignatures, withFormAction]).toHaveLength(2)
  })
})
