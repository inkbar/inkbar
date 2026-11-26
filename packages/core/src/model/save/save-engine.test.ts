import { describe, expectTypeOf, it } from 'vitest'

import type { SaveEngine, SaveEngineDocument } from './saver'
import type * as EngineModule from '@inkbar/engine'

// Core declares the engine by shape, so its built types import nothing from @inkbar/engine.
// These hold the shape to the engine's own types: a change to either that breaks the fit fails
// the type check.
describe('the engine a save writes with', () => {
  it('asks of the engine only what the engine has', () => {
    expectTypeOf<EngineModule.Engine>().toExtend<SaveEngine>()
    expectTypeOf<EngineModule.EngineDocument>().toExtend<SaveEngineDocument>()
    expectTypeOf<keyof SaveEngine>().toEqualTypeOf<
      'open' | 'checkRedaction' | 'destroy'
    >()
    expectTypeOf<keyof SaveEngineDocument>().toEqualTypeOf<
      'write' | 'redact' | 'save' | 'close'
    >()
  })
})
