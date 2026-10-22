import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InkRoot } from '../components/InkRoot'

import { useCommand } from './useCommand'

const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }

describe('useCommand', () => {
  it('renders a disabled, unnamed command on the server, before any plugin is set up', () => {
    let handle: ReturnType<typeof useCommand> | undefined
    function Probe() {
      handle = useCommand('nope.x')
      return null
    }
    renderToString(createElement(InkRoot, { src: null, assets }, createElement(Probe)))
    expect(handle).toMatchObject({ enabled: false, busy: false, status: '', label: '' })
  })
})
