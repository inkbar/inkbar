import { describe, expect, it } from 'vitest'

import {
  ACTION_COMMAND,
  countStubs,
  patchSandboxSource,
  patchScriptingSource,
} from './sandbox-patch'

/** The scripting source PDF.js's `Sandbox.create` hands the engine, caught by a stand-in engine. */
async function scriptingSource(): Promise<string> {
  const g = globalThis as Record<string, unknown>
  let source = ''
  g.window = {}
  g.__inkbarTestEngine = {
    stringToNewUTF8: (s: string) => {
      source = s
      return 1
    },
    ccall: () => 1,
    cwrap: () => () => undefined,
  }
  try {
    const { QuickJSSandbox } = await import('#pdfjs-sandbox')
    // QuickJSSandbox imports `${wasmUrl}quickjs-eval.js`; the comment swallows the file name.
    const sandbox = await QuickJSSandbox(
      'data:text/javascript,export default async () => globalThis.__inkbarTestEngine;//'
    )
    sandbox.create({ objects: {}, calculationOrder: [], appInfo: {}, docInfo: {} })
  } finally {
    delete g.window
    delete g.__inkbarTestEngine
  }
  return source
}

describe('the scripting source patch', () => {
  it('finds each empty method exactly once in the installed PDF.js', async () => {
    const source = await scriptingSource()
    expect(source).toContain('function initSandbox')
    expect(countStubs(source)).toEqual({
      submitForm: 1,
      mailDoc: 1,
      mailForm: 1,
      launchURL: 1,
    })
    const patched = patchScriptingSource(source)
    expect(countStubs(patched)).toEqual({
      submitForm: 0,
      mailDoc: 0,
      mailForm: 0,
      launchURL: 0,
    })
    for (const m of ['submitForm', 'mailDoc', 'mailForm', 'launchURL'])
      expect(patched).toContain(
        `${m}(...args) { this._send({ command: "${ACTION_COMMAND}", method: "${m}", args }); }`
      )
  })

  it('refuses a source where a method is missing or repeated', async () => {
    const source = await scriptingSource()
    expect(() => patchScriptingSource('class Doc {}')).toThrow(
      /submitForm, mailDoc, mailForm, launchURL/
    )
    expect(() => patchScriptingSource(source + source)).toThrow(/does not match/)
  })

  it('patches only the first string the engine copies', () => {
    const seen: string[] = []
    const engine = {
      stringToNewUTF8: (s: string) => {
        seen.push(s)
        return seen.length
      },
    }
    const patch = patchSandboxSource(engine)
    const stubs =
      '\n  submitForm() {}\n\n  mailDoc() {}\n\n  mailForm() {}\n\n  launchURL() {}\n'
    engine.stringToNewUTF8(stubs)
    engine.stringToNewUTF8('later')
    expect(seen[0]).not.toContain('submitForm() {}')
    expect(seen[1]).toBe('later')
    expect(patch.failure()).toBeUndefined()
  })

  it('records why a source could not be patched', () => {
    const engine = { stringToNewUTF8: (_s: string) => 1 }
    const patch = patchSandboxSource(engine)
    expect(() => engine.stringToNewUTF8('nothing to patch')).toThrow(/does not match/)
    expect(patch.failure()?.message).toMatch(/submitForm/)
  })
})
