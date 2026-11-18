import type { RedactionCandidate, RedactionFindings } from '../types.ts'

/**
 * One entry of the fork's page report: what lies under one quad of a region, or under one
 * candidate the fork found itself. The counts are the fork's; see its README.
 */
export interface RegionReport {
  /** Left, bottom, right and top, in PDF user space. */
  rect: readonly [number, number, number, number]
  kind: RedactionCandidate['kind']
  /** Characters under it in the page content and in forms. */
  textChars: number
  /** Images under it whose samples there are not one value. */
  imagesNotBlank: number
  /** Paths and shadings crossing it. */
  paths: number
  /** Text and images inside tiling patterns painted into it. */
  patternContent: number
  /** Characters in the appearances of annotations that meet it. */
  annotationText: number
  /** Images in the appearances of annotations that meet it, not blank there. */
  annotationImages: number
}

/**
 * What the fork found on one page. Each item of `candidates` becomes one candidate: a region's
 * reports, one per quad, with the region's index in the list the caller gave, or the one report
 * of a candidate the fork found itself, with no index.
 */
export interface PageReport {
  page: number
  candidates: readonly {
    reports: readonly [RegionReport, ...RegionReport[]]
    region?: number
  }[]
}

/** The fork's report on what a file carries besides its pages. */
export interface FileReport {
  /** One more than the earlier revisions the bytes hold. */
  revisions: number
  /** A non-empty document information dictionary. */
  info: boolean
  /** XMP metadata on the catalog. */
  xmp: boolean
  attachments: number
  scripts: boolean
  hiddenLayers: boolean
  signed: boolean
}

const presence = (count: number): 'none' | 'present' => (count > 0 ? 'present' : 'none')

function candidateOf(
  page: number,
  reports: readonly [RegionReport, ...RegionReport[]],
  region: number | undefined
): RedactionCandidate {
  const { kind } = reports[0]
  const sum = (key: Exclude<keyof RegionReport, 'rect' | 'kind'>) =>
    reports.reduce((total, report) => total + report[key], 0)
  const left = Math.min(...reports.map((r) => r.rect[0]))
  const bottom = Math.min(...reports.map((r) => r.rect[1]))
  const right = Math.max(...reports.map((r) => r.rect[2]))
  const top = Math.max(...reports.map((r) => r.rect[3]))
  const text = presence(sum('textChars') + sum('annotationText') + sum('patternContent'))
  const image = presence(sum('imagesNotBlank') + sum('annotationImages'))
  // A filled box is drawing itself, so paths under it say nothing.
  const box = kind === 'filled-box' || kind === 'annotation-box'
  const drawing = box ? 'none' : presence(sum('paths'))
  const found = text === 'present' || image === 'present' || drawing === 'present'
  return {
    page,
    ...(region !== undefined && { region }),
    rect: { x: left, y: bottom, width: right - left, height: top - bottom },
    kind,
    text,
    image,
    drawing,
    verdict: !found
      ? 'clean'
      : kind === 'redact-annotation'
        ? 'unapplied'
        : 'content-remains',
  }
}

/** Turns the fork's reports into findings. Pure: it decides every verdict the check gives. */
export function findingsFrom(pages: PageReport[], file: FileReport): RedactionFindings {
  return {
    candidates: pages.flatMap(({ page, candidates }) =>
      candidates.map(({ reports, region }) => candidateOf(page, reports, region))
    ),
    file: {
      earlierVersions: file.revisions - 1,
      metadata: file.info || file.xmp,
      attachments: file.attachments,
      scripts: file.scripts,
      hiddenLayers: file.hiddenLayers,
      signed: file.signed,
    },
  }
}
