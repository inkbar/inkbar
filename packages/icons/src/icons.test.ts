import * as lucide from 'lucide'
import { describe, expect, it } from 'vitest'

import { ICONS } from '../scripts/icon-list'

import * as icons from './icons'

describe('@inkbar/icons', () => {
  it('matches the pinned lucide; run `pnpm generate` if not', () => {
    expect(Object.keys(icons).sort()).toEqual([...ICONS].sort())
    const ours: Record<string, unknown> = icons
    const theirs: Record<string, unknown> = lucide
    for (const name of ICONS) expect(ours[name], name).toEqual(theirs[name])
  })
})
