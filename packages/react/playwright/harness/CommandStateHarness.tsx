import { writable } from '@inkbar/core'
import { definePlugin } from '@inkbar/core/dom'
import { Component, useLayoutEffect, useState, type ReactNode } from 'react'

import { InkCommand } from '../../src/components/InkCommand'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { useCommand } from '../../src/hooks/useCommand'

import type { PdfAssets } from '@inkbar/core'

// `always` is enabled without a document, so only plugin setup decides when it turns on.
const plugins = [
  definePlugin({
    id: 'sandbox',
    setup(ctx) {
      ctx.commands.add({
        id: 'always',
        label: 'Always',
        enabled: writable(true),
        run: () => undefined,
      })
    },
  }),
]

class Catch extends Component<{ children: ReactNode }, { code: string }> {
  override state = { code: '' }
  static getDerivedStateFromError(e: unknown) {
    return { code: (e as { code?: string }).code ?? String(e) }
  }
  override render() {
    return (
      <div data-testid="harness" data-error={this.state.code}>
        {this.state.code ? null : this.props.children}
      </div>
    )
  }
}

function Probe({ id }: { id: string }) {
  const { enabled } = useCommand(id)
  /** Every value `enabled` takes, from the first commit on. */
  const [seen, setSeen] = useState<boolean[]>([])
  useLayoutEffect(() => {
    setSeen((s) => (s.at(-1) === enabled ? s : [...s, enabled]))
  }, [enabled])
  return (
    <>
      <InkToolbar>
        <InkCommand id={id} />
      </InkToolbar>
      <output data-testid="seen">{seen.join(',')}</output>
    </>
  )
}

/** A command button and a record of its `enabled`, or the error an unknown id throws. */
export function CommandStateHarness({ assets, id }: { assets: PdfAssets; id: string }) {
  return (
    <Catch>
      <InkRoot src={null} assets={assets} plugins={plugins}>
        <Probe id={id} />
      </InkRoot>
    </Catch>
  )
}
