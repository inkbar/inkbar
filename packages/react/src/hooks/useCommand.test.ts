import { isInkError } from '@inkbar/core'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InkRoot } from '../components/InkRoot'

import { useCommand } from './useCommand'

const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }

function Probe() {
  useCommand('nope.x')
  return null
}

describe('useCommand', () => {
  it('throws UnknownCommand for an id no plugin registered', () => {
    let error: unknown
    try {
      renderToString(createElement(InkRoot, { src: null, assets }, createElement(Probe)))
    } catch (e) {
      error = e
    }
    expect(isInkError(error)).toBe(true)
    expect((error as { code: string }).code).toBe('UnknownCommand')
  })
})
