import { expect } from 'vitest'

/** The best of `runs` timings of `fn`, in ms. */
function best(fn: () => void, runs: number): number {
  let fastest = Infinity
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

/**
 * How the cost of `operation` grows: the best of several timings at 4n over the best at n, after a
 * warm-up. Linear work gives about 4 and quadratic about 16, so a ratio under 9 tells them apart on
 * any machine, load included. The ceiling only guards against a hang.
 */
export function expectLinearGrowth(
  operation: (n: number) => void,
  n: number,
  { maxRatio = 9, ceilingMs = 20_000 } = {}
): number {
  operation(n)
  const small = best(() => operation(n), 5)
  const large = best(() => operation(4 * n), 5)
  const ratio = large / Math.max(small, 0.01)
  expect(large, 'a ceiling against a hang').toBeLessThan(ceilingMs)
  expect(ratio, `4n took ${ratio.toFixed(1)} times as long as n`).toBeLessThan(maxRatio)
  return ratio
}
