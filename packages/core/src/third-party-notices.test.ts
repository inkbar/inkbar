import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')

describe('the published package carries the font metrics notice', () => {
  test('the notices file is in the package files list', () => {
    expect(pkg.files).toContain('THIRD-PARTY-NOTICES')
  })

  test("it holds the licence of the metrics source and Adobe's notice", () => {
    const text = read('THIRD-PARTY-NOTICES')
    expect(text).toContain('@pdf-lib/standard-fonts 1.0.0')
    expect(text).toContain('Copyright (c) 2018 Andrew Dillon')
    expect(text).toContain('Permission is hereby granted, free of charge')
    expect(text).toContain('Adobe Systems Incorporated')
  })

  test('it names the same source and version as the generated table', () => {
    const header = read('src/model/annotations/drawing/text/metrics-data.ts').slice(
      0,
      1200
    )
    expect(header).toContain('@pdf-lib/standard-fonts 1.0.0')
  })
})
