/**
 * PDF.js's scripting API defines `submitForm`, `mailDoc`, `mailForm` (on Doc) and `launchURL`
 * (on App) as empty methods, so a script calling them is silent. They cannot be replaced from a
 * script run inside the sandbox: scripts run as global code, where `this` is the global object,
 * and PDF.js copies each Doc method onto it as a bound, non-writable, non-configurable property
 * before any script runs. So the bridge rewrites the four empty bodies in the scripting source
 * before the sandbox evaluates it. Each replacement reports the call through the sandbox's own
 * `send` channel, with a command name only Inkbar uses; the host maps the arguments.
 *
 * One more rewrite fixes a fault in the sandbox's calculation loop. A field object built for a
 * name with no widget of its own, such as a parent the calculation order lists, has no `send`.
 * The loop calls it once the field's scripts have run, which throws and leaves every later
 * field in the order uncalculated. The rewrite skips the call when there is nothing to call.
 */

/** The command a rewritten method sends. */
export const ACTION_COMMAND = 'inkbar:action'

export type PatchedMethod = 'submitForm' | 'mailDoc' | 'mailForm' | 'launchURL'

const METHODS: readonly PatchedMethod[] = [
  'submitForm',
  'mailDoc',
  'mailForm',
  'launchURL',
]

/** The empty method as it appears in PDF.js's scripting source, one class member per line. */
const stub = (method: PatchedMethod) => `\n  ${method}() {}\n`

const replacement = (method: PatchedMethod) =>
  `\n  ${method}(...args) { this._send({ command: "${ACTION_COMMAND}", method: "${method}", args }); }\n`

/** The calculation loop's report of a field's new value, and the same call when `send` is set. */
const CALCULATE_SEND = 'target.obj._send({'
const CALCULATE_SEND_GUARDED = 'target.obj._send?.({'

/** How many times the calculation loop's unguarded send appears in `source`. */
export function countCalculateSends(source: string): number {
  return source.split(CALCULATE_SEND).length - 1
}

/** How many times each empty method appears in `source`. */
export function countStubs(source: string): Record<PatchedMethod, number> {
  const counts = {} as Record<PatchedMethod, number>
  for (const m of METHODS) counts[m] = source.split(stub(m)).length - 1
  return counts
}

/**
 * Rewrites the four empty methods and the calculation loop's send. Throws when any of them does
 * not appear exactly once, which means the PDF.js build differs from the one this was written
 * against.
 */
export function patchScriptingSource(source: string): string {
  const counts = countStubs(source)
  const off: string[] = METHODS.filter((m) => counts[m] !== 1)
  if (countCalculateSends(source) !== 1) off.push('runCalculate')
  if (off.length > 0)
    throw new Error(`The PDF.js scripting source does not match: ${off.join(', ')}`)
  return METHODS.reduce(
    (src, m) => src.replace(stub(m), () => replacement(m)),
    source.replace(CALCULATE_SEND, () => CALCULATE_SEND_GUARDED)
  )
}

interface SourceModule {
  stringToNewUTF8(source: string): number
}

/**
 * Wraps the engine's string copy so the first string it receives, the scripting source that
 * `Sandbox.create` hands it, is patched. A mismatch throws inside `create`, which then fails to
 * start the sandbox; `failure()` gives the reason.
 */
export function patchSandboxSource(module: SourceModule): {
  failure(): Error | undefined
} {
  const original = module.stringToNewUTF8.bind(module)
  let done = false
  let failure: Error | undefined
  module.stringToNewUTF8 = (source: string) => {
    if (done) return original(source)
    done = true
    try {
      return original(patchScriptingSource(source))
    } catch (e) {
      failure = e instanceof Error ? e : new Error(String(e))
      throw failure
    }
  }
  return { failure: () => failure }
}
