// Browser-safe: no Node imports. Browser tests import this module as `@inkbar/fixtures/urls`.

export const FIXTURE_NAMES = [
  'text-simple',
  'text-rotated-90',
  'text-rotated-180',
  'text-rotated-270',
  'text-cjk',
  'cropbox-offset',
  'userunit-2',
  'mixed-page-sizes',
  'annotated-markup',
  'annotated-notes-threaded',
  'annotated-redact',
  'annotated-shapes',
  'standard-callout',
  'annotated-unsupported',
  'acroform-basic',
  'incremental-saved',
  'object-streams',
  'encrypted-aes',
  'encrypted-rc4',
  'malformed-truncated',
  'malformed-missing-xref',
  'scanned-no-text',
] as const

export type FixtureName = (typeof FIXTURE_NAMES)[number]

/** URL under which every Playwright config serves `fixtures/pdf`. */
export function fixtureUrl(name: FixtureName): string {
  return `/fixtures/${name}.pdf`
}

export { browserAssets, type BrowserPdfAssets } from './browser-assets'
