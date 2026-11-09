import type { CDPSession } from '@playwright/test'

export type TouchPoint = { x: number; y: number; id: number }

/** One CDP touch event: real touch input, so the browser applies `touch-action` itself. */
export const touch = (
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  touchPoints: TouchPoint[]
): Promise<unknown> => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
