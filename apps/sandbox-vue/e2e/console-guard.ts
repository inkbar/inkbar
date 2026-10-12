import { expect, type test as base } from '@playwright/test'

export interface ConsoleGuard {
  /** Warnings, errors and uncaught exceptions seen in the current test so far. */
  readonly problems: readonly string[]
  /** Removes the messages matching `pattern` and returns them, for a test that expects them. */
  take(pattern: RegExp): string[]
}

/**
 * Console warnings, errors and uncaught exceptions fail the test unless the test takes them.
 * Call once at the top of a spec file.
 */
export function guardConsole(test: typeof base): ConsoleGuard {
  let problems: string[] = []
  test.beforeEach(({ page }) => {
    problems = []
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') problems.push(m.text())
    })
    page.on('pageerror', (e) => problems.push(e.message))
  })
  test.afterEach(() => {
    expect(problems).toEqual([])
  })
  return {
    get problems() {
      return problems
    },
    take(pattern) {
      const taken = problems.filter((p) => pattern.test(p))
      problems = problems.filter((p) => !pattern.test(p))
      return taken
    },
  }
}
