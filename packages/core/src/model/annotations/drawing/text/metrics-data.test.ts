import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const script = fileURLToPath(
  new URL('../../../../../scripts/generate-font-metrics.ts', import.meta.url)
)

describe('the generated font metrics', () => {
  test('running the generator again would leave the committed file as it is', () => {
    const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
    expect(out).toContain('is up to date')
  })
})
