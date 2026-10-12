import { describe, expect, it, vi } from 'vitest'

import { until } from './test-utils'

describe('until', () => {
  it('resolves once the predicate holds', async () => {
    let n = 0
    await until(() => ++n > 3)
    expect(n).toBeGreaterThan(3)
  })

  it('rejects on its own timer even when animation frames never arrive', async () => {
    // Frames that never fire, as in a hidden tab.
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    try {
      const start = performance.now()
      await expect(until(() => false, 100)).rejects.toThrow('until(): timed out')
      expect(performance.now() - start).toBeLessThan(1000)
    } finally {
      raf.mockRestore()
    }
  })
})
