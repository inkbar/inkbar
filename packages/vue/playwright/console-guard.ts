import { expect, type test as ctTest } from '@playwright/experimental-ct-vue'

export interface ConsoleGuard {
  /** Warnings, errors and uncaught exceptions seen in the current test so far. */
  readonly problems: readonly string[]
  /** Forget what has been seen, after a test has asserted on expected messages. */
  clear(): void
}

/**
 * Vue warnings and runtime errors fail the test instead of scrolling past in the output.
 * Call once at the top of a spec file.
 */
export function guardConsole(test: typeof ctTest): ConsoleGuard {
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
    clear() {
      problems = []
    },
  }
}
