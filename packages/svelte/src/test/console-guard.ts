import { afterEach, beforeEach, expect, vi } from 'vitest'

export interface ConsoleGuard {
  /** Warnings, errors and uncaught exceptions seen in the current test so far. */
  readonly problems: readonly string[]
  /** Forget what has been seen, after a test has asserted on expected messages. */
  clear(): void
}

const text = (args: unknown[]): string =>
  args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')

/**
 * Console warnings, errors and uncaught exceptions fail the test instead of scrolling past in
 * the output. Call once at the top of a spec file. Only the page's own console is seen: the PDF
 * engine's worker logs in its own thread, so engine warnings never land here.
 */
export function guardConsole(): ConsoleGuard {
  let problems: string[] = []
  let restore: (() => void) | undefined
  beforeEach(() => {
    problems = []
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      problems.push(text(args))
    })
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
      problems.push(text(args))
    })
    const onError = (e: ErrorEvent): void => {
      problems.push(e.message)
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      problems.push(text([e.reason]))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    restore = () => {
      warn.mockRestore()
      error.mockRestore()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  })
  afterEach(() => {
    restore?.()
    restore = undefined
    expect(problems).toEqual([])
  })
  return {
    get problems() {
      return problems
    },
    clear() {
      problems = []
    },
  }
}
