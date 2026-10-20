import { MessageCircle, MessageSquare } from '@inkbar/icons'
import { describe, expect, it } from 'vitest'

import { SHAPE_ICONS } from './shape-icons'

describe('SHAPE_ICONS', () => {
  // The note tool draws MessageSquare; a bubble must not look like it.
  it("gives the bubble its own icon, not the note tool's", () => {
    expect(SHAPE_ICONS.bubble).toBe(MessageCircle)
    expect(SHAPE_ICONS.bubble).not.toBe(MessageSquare)
  })

  it('gives each kind a different icon', () => {
    const icons = Object.values(SHAPE_ICONS)
    expect(new Set(icons).size).toBe(icons.length)
  })
})
