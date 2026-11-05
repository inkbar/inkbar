/*
 * Test support: a plugin keeping suggestions down page 0, top to bottom, each with a mark while
 * it is open and a card whose Accept marks it accepted.
 */
import { definePlugin } from '@inkbar/core/dom'

import type { Rect, RecordBase } from '@inkbar/core'

export interface Suggestion extends RecordBase {
  page: number
  rect: Rect
  reason: string
  status: 'open' | 'accepted'
}

/** `count` open suggestions on page 0: `s0` is first in reading order. */
export const suggestions = (count: number): Suggestion[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    page: 0,
    rect: { x: 72, y: 740 - i * 22, width: 120, height: 14 },
    reason: `Suggestion ${i}`,
    status: 'open',
  }))

export const suggestionsPlugin = definePlugin(
  'sandbox',
  (plugin, opts: { initial: Suggestion[] }) => {
    const list = plugin.records<Suggestion>('suggestions', {
      initial: () => opts.initial,
    })
    plugin.marks(list, {
      where: (s) => s.status === 'open',
      rect: (s) => s.rect,
      label: (s) => s.reason,
      card: (s) => ({
        title: s.reason,
        meta: `Page ${s.page + 1}`,
        actions: { Accept: () => list.update(s.id, { status: 'accepted' }) },
      }),
    })
  }
)
