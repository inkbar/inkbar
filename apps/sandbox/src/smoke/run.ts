/*
 * Runs a fixed list of checks one after another, each with its own time limit, and publishes
 * the outcome three ways: on `window.__inkbarSmoke` for a driver to read, as plain text on the
 * page for a screenshot or a video, and as a JSON POST to `?report=<url>` when the URL has one.
 */

export interface SmokeCheck {
  name: string
  /** Milliseconds before the check counts as failed. */
  timeout: number
  run(): Promise<void>
}

export type SmokeStatus = 'pass' | 'fail' | 'skip'

export interface SmokeResult {
  name: string
  /** True only for a check that passed. */
  ok: boolean
  status: SmokeStatus
  /** Why it failed, or why it was skipped. */
  error?: string
  /** The first lines of the error's stack, where the browser gives one. */
  stack?: string
  ms: number
}

export interface SmokeState {
  /** The front end the checks ran through: vanilla, vue, react or svelte. */
  front: string
  done: boolean
  results: SmokeResult[]
  userAgent: string
}

declare global {
  interface Window {
    __inkbarSmoke?: SmokeState
  }
}

/**
 * Thrown by a check that cannot run because an earlier one did not give it what it needs. It is
 * recorded as skipped, with the reason, so one failure is reported once.
 */
export class SkipCheck extends Error {
  override name = 'SkipCheck'
}

/** Rejects after `ms` with a message naming the limit. */
function deadline(ms: number): { promise: Promise<never>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return { promise, cancel: () => clearTimeout(timer) }
}

function describe(error: unknown): string {
  if (error instanceof SkipCheck) return error.message
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' && !error.message.includes(code)
      ? `${error.name} (${code}): ${error.message}`
      : `${error.name}: ${error.message}`
  }
  return String(error)
}

const WORD: Record<SmokeStatus, string> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }

function line(result: SmokeResult): string {
  const text = `${WORD[result.status]}  ${result.name}  ${Math.round(result.ms)} ms`
  return result.error ? `${text}\n      ${result.error}` : text
}

/** The results so far as text, with a closing line once every check has run. */
export function formatResults(state: SmokeState): string {
  const lines = [`Front end: ${state.front}`, '', ...state.results.map(line)]
  if (state.done) {
    const count = (s: SmokeStatus) => state.results.filter((r) => r.status === s).length
    const failed = count('fail')
    const skipped = count('skip')
    lines.push(
      '',
      failed + skipped === 0
        ? `All ${state.results.length} checks passed.`
        : `${count('pass')} passed, ${failed} failed, ${skipped} skipped.`
    )
  } else lines.push('', 'Running…')
  lines.push('', state.userAgent)
  return lines.join('\n')
}

async function report(url: string, state: SmokeState): Promise<void> {
  try {
    // Plain text keeps the request simple: no preflight, so any small server can take it.
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(state),
    })
  } catch (error) {
    console.warn('Could not send the smoke report', error)
  }
}

/**
 * Runs `checks` in order. A check that throws or runs out of time fails, one that throws
 * `SkipCheck` is skipped, and the next one still runs.
 */
export async function runChecks(
  front: string,
  checks: readonly SmokeCheck[],
  out: HTMLElement
): Promise<SmokeState> {
  const state: SmokeState = {
    front,
    done: false,
    results: [],
    userAgent: navigator.userAgent,
  }
  window.__inkbarSmoke = state
  const show = () => {
    out.textContent = formatResults(state)
  }
  show()
  for (const check of checks) {
    const started = performance.now()
    const limit = deadline(check.timeout)
    try {
      await Promise.race([check.run(), limit.promise])
      state.results.push({
        name: check.name,
        ok: true,
        status: 'pass',
        ms: performance.now() - started,
      })
    } catch (error) {
      const skipped = error instanceof SkipCheck
      state.results.push({
        name: check.name,
        ok: false,
        status: skipped ? 'skip' : 'fail',
        error: describe(error),
        ...(!skipped && error instanceof Error && error.stack
          ? { stack: error.stack.split('\n').slice(0, 6).join('\n') }
          : {}),
        ms: performance.now() - started,
      })
    } finally {
      limit.cancel()
    }
    show()
  }
  state.done = true
  show()
  document.body.dataset.smoke = state.results.every((r) => r.ok) ? 'passed' : 'failed'
  const to = new URLSearchParams(location.search).get('report')
  if (to) await report(to, state)
  return state
}
