// Helpers for tests that compare the engine reader's links with the PDF.js reader's. Not exported
// from the package.
import { expect } from 'vitest'

import type { ExplicitDestinationShape } from './types'
import type { Destination, LinkTarget } from '../model/destination'
import type { InkDocument } from '../model/document'
import type { PageLink } from '../model/links'

/** A link's target as a host can tell it: a destination by its name, if any, and where it goes. */
type SeenTarget =
  | Exclude<LinkTarget, { kind: 'dest' }>
  | { kind: 'dest'; name: string | undefined; resolved: Destination | undefined }

type SeenLink = Omit<PageLink, 'target'> & { target: SeenTarget }

/**
 * The page's links as a host sees them, each destination resolved by the document. Only where an
 * explicit destination goes is compared: the engine holds the numbers in its raw array in single
 * precision.
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

/**
 * An explicit destination's facts as the engine reports a well-formed array: the page as a whole
 * number, the fit as a name, then `given` as written, each a number or `null`. `shape` overrides
 * any of the facts about how the array is written.
 */
export function explicitDest(
  page: number,
  fit: string,
  given: readonly (number | null)[] = [],
  shape: Partial<ExplicitDestinationShape> = {}
): ExplicitDestinationShape {
  return {
    page,
    fit,
    args: [...given, null, null, null, null].slice(0, 4),
    argCount: given.length,
    argKinds: given.slice(0, 8).map((arg) => (arg === null ? 'null' : 'number')),
    argIndirect: false,
    fitKind: 'name',
    pageKind: 'integer',
    ...shape,
  }
}
