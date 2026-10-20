import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ICONS } from '../scripts/icon-list'

const read = (name: string): string =>
  readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

describe('package docs', () => {
  it('the README gives the number of icons the package has', () => {
    expect(read('README.md')).toContain(`They are ${ICONS.length} icons`)
  })

  // A list would go stale as icons are added: the notices cover the file as a whole.
  it('the README and LICENSE name no icons one by one', () => {
    for (const doc of ['README.md', 'LICENSE'])
      expect(read(doc), doc).not.toMatch(/SquareDashedMousePointer/)
  })
})
