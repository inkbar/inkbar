// Helpers for tests of the engine reader's links and destinations. Not exported from the
// package.

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
