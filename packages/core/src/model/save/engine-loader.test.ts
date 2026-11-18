import { describe, expect, expectTypeOf, it } from 'vitest'

import type { EngineLoader, SaveEngine, SaveEngineDocument } from './saver'
import type * as EngineModule from '@inkbar/engine'

// Core declares the engine by shape, so its built types import nothing from @inkbar/engine.
// These hold the shape to the engine's own types: a change to either that breaks the fit fails
// the type check.
describe('EngineLoader', () => {
  it('is satisfied by importing @inkbar/engine', () => {
    const loader: EngineLoader = () => import('@inkbar/engine')
    expect(typeof loader).toBe('function')
    expectTypeOf<() => Promise<typeof EngineModule>>().toExtend<EngineLoader>()
  })

  it('asks of the engine only what the engine has', () => {
    expectTypeOf<EngineModule.Engine>().toExtend<SaveEngine>()
    expectTypeOf<EngineModule.EngineDocument>().toExtend<SaveEngineDocument>()
    expectTypeOf<keyof SaveEngine>().toEqualTypeOf<'open' | 'destroy'>()
    expectTypeOf<keyof SaveEngineDocument>().toEqualTypeOf<'write' | 'save'>()
  })
})
