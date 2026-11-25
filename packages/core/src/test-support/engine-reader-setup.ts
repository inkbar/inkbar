// Test support only, never production code: the setup file of the `browser-engine` Vitest
// project, which runs the text, search, link, outline, form and scripting browser tests a second
// time with the engine reading the file. No build entry reaches this directory, and the package
// publishes only `dist`.
import { afterEach, beforeEach, expect, vi } from 'vitest'

import type * as ReaderModule from '../engine-reader/reader'
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

/** The script reads an engine reader passed to its fallback reader during the test. */
const fallbackScriptReads: string[] = []

// The engine reader reads the file's JavaScript and builds the sandbox's fields itself: it turns
// to its fallback only when no engine can start, which no test here does.
vi.mock(import('../engine-reader/reader'), async (importOriginal) => {
  const original: typeof ReaderModule = await importOriginal()
  return {
    ...original,
    createEngineReader: (options) => {
      const fallback = options.fallback
      return original.createEngineReader({
        ...options,
        ...(fallback && {
          fallback: {
            ...fallback,
            scripts: () => {
              fallbackScriptReads.push('scripts')
              return fallback.scripts()
            },
            pageScripts: (page) => {
              fallbackScriptReads.push('pageScripts')
              return fallback.pageScripts(page)
            },
            sandboxFields: () => {
              fallbackScriptReads.push('sandboxFields')
              return fallback.sandboxFields()
            },
          },
        }),
      })
    },
  }
})

afterEach(() => {
  expect(
    fallbackScriptReads.splice(0),
    'script reads the engine reader passed on'
  ).toEqual([])
})
