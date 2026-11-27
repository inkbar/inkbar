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
    expect(count.found(undefined, true, 'a')).toEqual({ kind: 'go-on' })
    wait(20_000)
    expect(count.found(undefined, true, 'b')).toEqual({ kind: 'go-on' })
    wait(STOP_WINDOW - 20_001)
    expect(count.found(undefined, true, 'c')).toEqual({ kind: 'stop' })
  })

  it('does not count a stop from before the window', () => {
    const { count, wait } = counted()
    count.found(undefined, true, 'a')
    wait(20_000)
    count.found(undefined, true, 'b')
    wait(STOP_WINDOW - 20_000)
    // The first is now 60 seconds old.
    expect(count.found(undefined, true, 'c')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, true, 'd')).toEqual({ kind: 'stop' })
  })

  it("blocks a page at its second stop, with an error naming it and the stop's cause", () => {
    const { count } = counted()
    const cause = new Error('engine-failure')
    expect(count.found(3, true, cause)).toEqual({ kind: 'go-on' })
    expect(count.blocked(3)).toBeUndefined()
    const outcome = count.found(3, false, cause)
    expect(outcome).toMatchObject({
      kind: 'blocked',
      error: { name: 'InkError', code: 'EngineUnavailable', details: { page: 3 }, cause },
    })
    expect(count.blocked(3)).toBe((outcome as { error: unknown }).error)
    expect(count.blocked(4)).toBeUndefined()
  })

  it("counts neither a page's blocking stop nor a stop that does not count", () => {
    const { count } = counted()
    count.found(3, true, 'a')
    count.found(3, true, 'b')
    count.found(undefined, false, 'c')
    count.found(5, false, 'd')
    // Only page 3's first stop counted; this is the second.
    expect(count.found(undefined, true, 'e')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, true, 'f')).toEqual({ kind: 'stop' })
  })

  it("forgets the counted stops, and keeps each page's stops and blocks", () => {
    const { count } = counted()
    count.found(3, true, 'a')
    count.found(3, true, 'b')
    count.found(5, true, 'c')
    count.found(undefined, true, 'd')
    count.forgetCounted()
    // Page 3 stays blocked, and page 5's next stop blocks it without counting.
    expect(count.blocked(3)).toMatchObject({ details: { page: 3 } })
    expect(count.found(5, true, 'e')).toMatchObject({ kind: 'blocked' })
    // Nothing counted before survives: two counted stops leave the document reading.
    expect(count.found(undefined, true, 'f')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, true, 'g')).toEqual({ kind: 'go-on' })
    expect(count.found(undefined, true, 'h')).toEqual({ kind: 'stop' })
  })

  it("takes back a page's stop when no engine starts to replace the one it dropped", () => {
    const { count } = counted()
    count.found(3, true, 'a')
    count.notReplaced()
    // Page 3 has no stop left: its next stop does not block it.
    expect(count.found(3, true, 'b')).toEqual({ kind: 'go-on' })
    count.replaced()
    count.notReplaced()
    // The stop stood once an engine started: this one blocks.
    expect(count.found(3, false, 'c')).toMatchObject({ kind: 'blocked' })
    // A block is never taken back.
    count.notReplaced()
    expect(count.blocked(3)).toBeDefined()
  })
})
