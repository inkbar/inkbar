import { describe, expect, it } from 'vitest'

import { createStopCount, STOP_WINDOW } from './stops'

/** A stop count on a clock the test moves. */
const counted = () => {
  let time = 0
  const count = createStopCount(() => time)
  return {
    count,
    wait: (ms: number) => {
      time += ms
    },
  }
}

describe('the stop count', () => {
  it('stops the document at the third counted stop within the window', () => {
    const { count, wait } = counted()
    expect(count.found(undefined, false, 'a')).toEqual({ kind: 'go-on' })
    wait(20_000)
    expect(count.found(undefined, false, 'b')).toEqual({ kind: 'go-on' })
    wait(STOP_WINDOW - 20_001)
    expect(count.found(undefined, false, 'c')).toEqual({ kind: 'stop' })
  })

  it('does not count a stop from before the window', () => {
    const { count, wait } = counted()
    count.found(undefined, false, 'a')
    wait(20_000)
    count.found(undefined, false, 'b')
    wait(STOP_WINDOW - 20_000)
    // The first is now 60 seconds old.
    expect(count.found(undefined, false, 'c')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, false, 'd')).toEqual({ kind: 'stop' })
  })

  it("blocks a page at its second stop, with an error naming it and the stop's cause", () => {
    const { count } = counted()
    const cause = new Error('engine-failure')
    expect(count.found(3, false, cause)).toEqual({ kind: 'go-on' })
    expect(count.blocked(3)).toBeUndefined()
    const outcome = count.found(3, true, cause)
    expect(outcome).toMatchObject({
      kind: 'blocked',
      error: { name: 'InkError', code: 'EngineUnavailable', details: { page: 3 }, cause },
    })
    expect(count.blocked(3)).toBe((outcome as { error: unknown }).error)
    expect(count.blocked(4)).toBeUndefined()
  })

  it("counts neither a page's blocking stop nor a stop on a retry", () => {
    const { count } = counted()
    count.found(3, false, 'a')
    count.found(3, false, 'b')
    count.found(undefined, true, 'c')
    count.found(5, true, 'd')
    // Only page 3's first stop counted; this is the second.
    expect(count.found(undefined, false, 'e')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, false, 'f')).toEqual({ kind: 'stop' })
  })

  it('forgets every stop and block once cleared', () => {
    const { count } = counted()
    count.found(3, false, 'a')
    count.found(3, false, 'b')
    count.found(undefined, false, 'c')
    count.clear()
    expect(count.blocked(3)).toBeUndefined()
    expect(count.found(3, false, 'd')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, false, 'e')).toEqual({ kind: 'go-on' })
  })
})
