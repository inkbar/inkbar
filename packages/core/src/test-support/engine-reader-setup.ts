// Test support only, never production code: the setup file of the `browser-engine` Vitest
// project, which runs the text, search, link, outline, form, scripting, page, viewer, save and
// redaction browser tests a second time with the engine reading the file. No build entry reaches
// this directory, and the package publishes only `dist`.
import { beforeEach, vi } from 'vitest'

import type { EngineLoader } from '../model/document'

const flag = globalThis as { __INKBAR_READER__?: unknown }

/** The engine loader the engine reader's own tests pass. */
const engine: EngineLoader = () => import('@inkbar/engine')

flag.__INKBAR_READER__ = 'engine'
// Set again before each test: tests that switch the reader on for themselves delete it after.
beforeEach(() => {
  flag.__INKBAR_READER__ = 'engine'
})

// Every document a test opens, through `openFixtureInBrowser`, `createViewer` or `openDocument`
// itself, gets the engine loader unless the test passes its own.
vi.mock(import('../model/document'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    openDocument: ((source, options) =>
      original.openDocument(source, {
        ...options,
        engine: options.engine ?? engine,
      })) satisfies typeof original.openDocument,
  }
})
