import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPressTracker, type PagePress } from './press'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

type Kind = PagePress['pointerType']

function ev(clientX = 100, clientY = 100, pointerType: Kind = 'mouse'): PointerEvent {
  return { pointerId: 1, pointerType, clientX, clientY } as PointerEvent
}

function setup() {
  const onPress = vi.fn()
  const onLongPress = vi.fn()
  const tracker = createPressTracker({ onPress, onLongPress })
  const press = (pointerType: Kind): PagePress => ({
    page: 0,
    point: { x: 10, y: 20 },
    pointerType,
  })
  return { tracker, onPress, onLongPress, press }
}

describe('createPressTracker', () => {
  it('a still mouse click is a press', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(), press('mouse'))
    tracker.up(ev())
    expect(onPress).toHaveBeenCalledExactlyOnceWith(press('mouse'))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('a mouse held for 2 s is still a press, never a long press', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(), press('mouse'))
    vi.advanceTimersByTime(2000)
    expect(onLongPress).not.toHaveBeenCalled()
    tracker.up(ev())
    expect(onPress).toHaveBeenCalledOnce()
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('a touch held 500 ms fires one long press and no press on release', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledExactlyOnceWith(press('touch'))
    vi.advanceTimersByTime(2000)
    tracker.up(ev(100, 100, 'touch'))
    expect(onLongPress).toHaveBeenCalledOnce()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('a pen held 500 ms fires a long press', () => {
    const { tracker, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'pen'), press('pen'))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('a touch released at 499 ms is a press', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    vi.advanceTimersByTime(499)
    tracker.up(ev(100, 100, 'touch'))
    vi.advanceTimersByTime(1000)
    expect(onPress).toHaveBeenCalledExactlyOnceWith(press('touch'))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('moving 11 px on touch cancels both', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    tracker.move(ev(111, 100, 'touch'))
    vi.advanceTimersByTime(1000)
    tracker.up(ev(100, 100, 'touch'))
    expect(onPress).not.toHaveBeenCalled()
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('moving 9 px on touch still presses', () => {
    const { tracker, onPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    tracker.move(ev(109, 100, 'touch'))
    tracker.up(ev(109, 100, 'touch'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('moving 9 px on touch still long presses', () => {
    const { tracker, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    tracker.move(ev(100, 109, 'touch'))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('moving 5 px with a mouse cancels', () => {
    const { tracker, onPress, press } = setup()
    tracker.down(ev(), press('mouse'))
    tracker.move(ev(105, 100))
    tracker.up(ev(100, 100))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('cancel after a long press produces nothing more (Review Focus 4)', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    vi.advanceTimersByTime(500)
    tracker.cancel()
    tracker.up(ev(100, 100, 'touch'))
    vi.advanceTimersByTime(1000)
    expect(onLongPress).toHaveBeenCalledOnce()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('cancel before the time stops the long press and the press', () => {
    const { tracker, onPress, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    tracker.cancel()
    vi.advanceTimersByTime(1000)
    tracker.up(ev(100, 100, 'touch'))
    expect(onPress).not.toHaveBeenCalled()
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('ignores moves and releases of another pointer', () => {
    const { tracker, onPress, press } = setup()
    tracker.down(ev(), press('mouse'))
    tracker.move({ ...ev(200, 200), pointerId: 2 })
    tracker.up({ ...ev(), pointerId: 2 })
    expect(onPress).not.toHaveBeenCalled()
    tracker.up(ev())
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('destroy clears a pending long press', () => {
    const { tracker, onLongPress, press } = setup()
    tracker.down(ev(100, 100, 'touch'), press('touch'))
    tracker.destroy()
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})
