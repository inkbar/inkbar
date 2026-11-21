// Helpers for tests that compare the engine reader's links with the PDF.js reader's. Not exported
// from the package.
import { expect } from 'vitest'

import type { Destination, LinkTarget } from '../model/destination'
import type { InkDocument } from '../model/document'
import type { PageLink } from '../model/links'

/** A link's target as a host can tell it: a destination by its name, if any, and where it goes. */
type SeenTarget =
  | Exclude<LinkTarget, { kind: 'dest' }>
  | { kind: 'dest'; name: string | undefined; resolved: Destination | undefined }

type SeenLink = Omit<PageLink, 'target'> & { target: SeenTarget }

/**
 * The page's links as a host sees them, each destination resolved by the document. An explicit
 * destination's raw array is the reader's own: PDF.js gives the page as an object reference,
 * the engine as its index, so only where it goes is compared.
 */
export async function linksAsSeen(doc: InkDocument, page: number): Promise<SeenLink[]> {
  return Promise.all(
    doc.links(page).map(async (link) => ({
      ...link,
      target:
        link.target.kind === 'dest'
          ? {
              kind: 'dest' as const,
              name: typeof link.target.raw === 'string' ? link.target.raw : undefined,
              resolved: await doc.resolveDestination(link.target.raw),
            }
          : link.target,
    }))
  )
}

/** The two readers' links are the same: everything equal, rects to 0.01 of a point. */
export function expectSameLinks(engine: SeenLink[], pdfjs: SeenLink[]): void {
  const withoutRect = (links: SeenLink[]) => links.map(({ rect: _rect, ...rest }) => rest)
  expect(withoutRect(engine)).toEqual(withoutRect(pdfjs))
  engine.forEach((link, i) => {
    const other = pdfjs[i]!.rect
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(
        Math.abs(link.rect[key] - other[key]),
        `${link.id} ${key}`
      ).toBeLessThanOrEqual(0.01)
  })
}
