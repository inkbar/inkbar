import { describe, expect, it } from 'vitest'

import type { InkRoot } from './components/InkRoot'
import type { ComponentProps } from 'react'

type Props = ComponentProps<typeof InkRoot>

// `pnpm typecheck` covers this file: each `@ts-expect-error` fails the build if its prop comes
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
      // @ts-expect-error `onFormAction` is gone: use `onAction`.
      onFormAction: () => undefined,
    }
    expect([withSignatures, withFormAction]).toHaveLength(2)
  })
})
