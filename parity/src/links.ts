// A page's links with each destination replaced by where it goes.
import type { Destination, PageLink, RawDestination } from '@inkbar/core'

/**
 * `links` with each destination target replaced by where it goes, as `resolve` resolves it, so
 * the baseline holds the page and place a link leads to. A named destination that does not
 * resolve keeps its name; an explicit one that does not resolve becomes an empty array.
 */
export async function resolveLinks(
  links: readonly PageLink[],
  resolve: (raw: RawDestination) => Promise<Destination | undefined>
): Promise<PageLink[]> {
  return Promise.all(
    links.map(async (link) => {
      if (link.target.kind !== 'dest') return link
      const dest = await resolve(link.target.raw)
      if (dest !== undefined) return { ...link, target: { kind: 'resolved', dest } }
      return typeof link.target.raw === 'string'
        ? link
        : { ...link, target: { kind: 'dest', raw: [] } }
    })
  )
}
