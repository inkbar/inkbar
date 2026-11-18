import { describe, expect, test } from 'vitest'

import { findingsFrom, type FileReport, type RegionReport } from './verdict.ts'

const FILE: FileReport = {
  revisions: 1,
  info: false,
  xmp: false,
  attachments: 0,
  scripts: false,
  hiddenLayers: false,
  signed: false,
}

/** A report of nothing under [10, 20, 110, 70], with `counts` over it. */
function report(
  counts: Partial<RegionReport> = {},
  kind: RegionReport['kind'] = 'region'
): RegionReport {
  return {
    rect: [10, 20, 110, 70],
    kind,
    textChars: 0,
    imagesNotBlank: 0,
    paths: 0,
    patternContent: 0,
    annotationText: 0,
    annotationImages: 0,
    ...counts,
  }
}

/** The one candidate made from `reports`, on page 0. */
const candidate = (...reports: [RegionReport, ...RegionReport[]]) =>
  findingsFrom([{ page: 0, candidates: [reports] }], FILE).candidates[0]

describe('text', () => {
  test('is present when characters are under it', () => {
    expect(candidate(report({ textChars: 1 }))?.text).toBe('present')
  })

  test('is present when an annotation appearance holds text under it', () => {
    expect(candidate(report({ annotationText: 2 }))?.text).toBe('present')
  })

  test('is present when a pattern under it holds text or an image', () => {
    expect(candidate(report({ patternContent: 1 }))?.text).toBe('present')
  })

  test('is none when none of the three counts anything', () => {
    expect(candidate(report({ imagesNotBlank: 1, paths: 1 }))?.text).toBe('none')
  })
})

describe('image', () => {
  test('is present when an image under it is not blank', () => {
    expect(candidate(report({ imagesNotBlank: 1 }))?.image).toBe('present')
  })

  test('is present when an annotation appearance paints an image under it', () => {
    expect(candidate(report({ annotationImages: 1 }))?.image).toBe('present')
  })

  test('is none when neither counts anything', () => {
    expect(candidate(report({ textChars: 1, paths: 1 }))?.image).toBe('none')
  })
})

describe('drawing', () => {
  test('is present when a path crosses a region', () => {
    expect(candidate(report({ paths: 1 }))?.drawing).toBe('present')
  })

  test('is none when no path crosses it', () => {
    expect(candidate(report({ textChars: 1 }))?.drawing).toBe('none')
  })

  test('is always none for a filled box, which is drawing itself', () => {
    const found = candidate(report({ paths: 3 }, 'filled-box'))
    expect(found?.drawing).toBe('none')
    expect(found?.verdict).toBe('clean')
  })

  test('is always none for an annotation drawn as a box', () => {
    const found = candidate(report({ paths: 1 }, 'annotation-box'))
    expect(found?.drawing).toBe('none')
    expect(found?.verdict).toBe('clean')
  })

  test('counts for a redact annotation', () => {
    expect(candidate(report({ paths: 1 }, 'redact-annotation'))?.drawing).toBe('present')
  })
})

describe('verdict', () => {
  test('is unapplied for a redact annotation with anything under it', () => {
    for (const counts of [{ textChars: 1 }, { imagesNotBlank: 1 }, { paths: 1 }])
      expect(candidate(report(counts, 'redact-annotation'))?.verdict).toBe('unapplied')
  })

  test('is clean for a redact annotation with nothing under it', () => {
    expect(candidate(report({}, 'redact-annotation'))?.verdict).toBe('clean')
  })

  test('is content-remains for any other candidate with anything under it', () => {
    for (const kind of ['region', 'filled-box', 'annotation-box'] as const)
      for (const counts of [{ textChars: 1 }, { annotationImages: 1 }])
        expect(candidate(report(counts, kind))?.verdict, kind).toBe('content-remains')
    expect(candidate(report({ paths: 1 }))?.verdict).toBe('content-remains')
  })

  test('is clean when nothing is under it', () => {
    expect(candidate(report())).toEqual({
      page: 0,
      rect: { x: 10, y: 20, width: 100, height: 50 },
      kind: 'region',
      text: 'none',
      image: 'none',
      drawing: 'none',
      verdict: 'clean',
    })
  })
})

describe('regions of several quads', () => {
  test('take the bounds of their quads', () => {
    const found = candidate(report(), { ...report(), rect: [100, 0, 200, 30] })
    expect(found?.rect).toEqual({ x: 10, y: 0, width: 190, height: 70 })
  })

  test('are present for each kind any of their quads finds', () => {
    const found = candidate(
      report({ textChars: 1 }),
      report({ imagesNotBlank: 1 }),
      report({ paths: 1 })
    )
    expect(found).toMatchObject({
      text: 'present',
      image: 'present',
      drawing: 'present',
      verdict: 'content-remains',
    })
  })
})

test('lists candidates page by page, each with its page', () => {
  const findings = findingsFrom(
    [
      { page: 0, candidates: [[report()], [report({ textChars: 1 })]] },
      { page: 2, candidates: [[report({}, 'redact-annotation')]] },
    ],
    FILE
  )
  expect(findings.candidates.map((c) => [c.page, c.kind, c.verdict])).toEqual([
    [0, 'region', 'clean'],
    [0, 'region', 'content-remains'],
    [2, 'redact-annotation', 'clean'],
  ])
})

describe('file', () => {
  test('counts the revisions before the last as earlier versions', () => {
    expect(findingsFrom([], FILE).file.earlierVersions).toBe(0)
    expect(findingsFrom([], { ...FILE, revisions: 3 }).file.earlierVersions).toBe(2)
  })

  test('reports metadata when the file has an info dictionary or XMP', () => {
    expect(findingsFrom([], FILE).file.metadata).toBe(false)
    expect(findingsFrom([], { ...FILE, info: true }).file.metadata).toBe(true)
    expect(findingsFrom([], { ...FILE, xmp: true }).file.metadata).toBe(true)
  })

  test('passes the other facts through', () => {
    const file = {
      ...FILE,
      attachments: 2,
      scripts: true,
      hiddenLayers: true,
      signed: true,
    }
    expect(findingsFrom([], file).file).toEqual({
      earlierVersions: 0,
      metadata: false,
      attachments: 2,
      scripts: true,
      hiddenLayers: true,
      signed: true,
    })
  })
})
