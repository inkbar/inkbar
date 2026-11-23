// Compares two readers' links and outlines. Each difference is one line naming the link or outline
// item and the field, PDF.js's value first.
import type {
  Destination,
  LinkTarget,
  OutlineItem,
  PageLink,
  RawDestination,
} from '@inkbar/core'

type Quad = NonNullable<PageLink['quads']>[number]

/** How far apart, in points, two readers may place a link's rect or quads. */
export const LINK_TOLERANCE = 0.01

/**
 * `links` with each destination target replaced by where it goes, as `resolve` resolves it. An
 * explicit destination's raw array is the reader's own (PDF.js names the page by its object
 * reference, the engine by its index), so only where it goes can be compared. A named destination
 * that does not resolve keeps its name; an explicit one that does not resolve becomes an empty
 * array, so two that go nowhere compare equal.
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

const json = (v: unknown) =>
  JSON.stringify(v, (_key, value: unknown) => (value === undefined ? null : value))

/** Whether two values are equal, numbers within `LINK_TOLERANCE`. */
function near(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= LINK_TOLERANCE
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => near(v, b[i]))
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ka = Object.keys(a).filter(
      (k) => (a as Record<string, unknown>)[k] !== undefined
    )
    const kb = Object.keys(b).filter(
      (k) => (b as Record<string, unknown>)[k] !== undefined
    )
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
      )
    )
  }
  return a === b
}

const targetLine = (a: LinkTarget, b: LinkTarget) =>
  near(a, b) ? [] : [`target: PDF.js ${json(a)}, engine ${json(b)}`]

const point = (p: { x: number; y: number }) => `(${p.x}, ${p.y})`

function quadLines(a: readonly Quad[] | undefined, b: readonly Quad[] | undefined) {
  if (a === undefined || b === undefined || a.length !== b.length) {
    if (a === undefined && b === undefined) return []
    return [`quads: PDF.js ${a?.length ?? 'none'}, engine ${b?.length ?? 'none'}`]
  }
  const out: string[] = []
  a.forEach((qa, i) => {
    const qb = b[i]!
    for (const corner of ['p1', 'p2', 'p3', 'p4'] as const) {
      if (!near(qa[corner], qb[corner]))
        out.push(
          `quad ${i + 1} ${corner}: PDF.js ${point(qa[corner])}, engine ${point(qb[corner])}`
        )
    }
  })
  return out
}

/** How one link read by both readers differs, one line per field. */
function oneLink(a: PageLink, b: PageLink): string[] {
  const out: string[] = []
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!near(a.rect[key], b.rect[key]))
      out.push(`rect ${key}: PDF.js ${a.rect[key]}, engine ${b.rect[key]}`)
  }
  out.push(...quadLines(a.quads, b.quads))
  if (a.order !== b.order) out.push(`order: PDF.js ${a.order}, engine ${b.order}`)
  if (a.page !== b.page) out.push(`page: PDF.js ${a.page}, engine ${b.page}`)
  out.push(...targetLine(a.target, b.target))
  return out.map((line) => `link ${a.id}: ${line}`)
}

/**
 * How the engine's links for a page (`b`) differ from PDF.js's (`a`): the count, the ids and their
 * order, and for each link its rect and quads (within `LINK_TOLERANCE`), its `order` and its
 * target. Destination targets should come through `resolveLinks` first. Empty when they agree.
 */
export function linkDifferences(
  a: readonly PageLink[],
  b: readonly PageLink[]
): string[] {
  const out: string[] = []
  if (a.length !== b.length) out.push(`count: PDF.js ${a.length}, engine ${b.length}`)
  const idsA = a.map((l) => l.id)
  const idsB = b.map((l) => l.id)
  const sameSet =
    idsA.length === idsB.length &&
    [...idsA].sort().every((id, i) => id === [...idsB].sort()[i])
  if (sameSet) {
    if (idsA.some((id, i) => id !== idsB[i]))
      out.push(
        `links in a different order: PDF.js ${idsA.join(', ')}; engine ${idsB.join(', ')}`
      )
    for (const link of a)
      out.push(
        ...oneLink(
          link,
          b.find((l) => l.id === link.id)!
        )
      )
    return out
  }
  if (a.length === b.length) {
    // Paired by place: each id that differs is named there, and the rest compared.
    a.forEach((link, i) => {
      const other = b[i]!
      if (link.id !== other.id)
        out.push(`link ${i + 1}: id: PDF.js ${link.id}, engine ${other.id}`)
      else out.push(...oneLink(link, other))
    })
    return out
  }
  for (const link of a) {
    const other = b.find((l) => l.id === link.id)
    if (other) out.push(...oneLink(link, other))
    else out.push(`link ${link.id}: only PDF.js gives it`)
  }
  for (const link of b)
    if (!idsA.includes(link.id)) out.push(`link ${link.id}: only the engine gives it`)
  return out
}

/**
 * How the engine's outline (`b`) differs from PDF.js's (`a`): for each item, by its id and title,
 * its title, bold, italic, open, target and number of children. Children are compared as far as
 * both readers give them. Empty when the trees agree.
 */
export function outlineDifferences(
  a: readonly OutlineItem[],
  b: readonly OutlineItem[]
): string[] {
  const out: string[] = []
  if (a.length !== b.length)
    out.push(`top level: PDF.js ${a.length} items, engine ${b.length}`)
  const walk = (xs: readonly OutlineItem[], ys: readonly OutlineItem[]) => {
    xs.forEach((x, i) => {
      const y = ys[i]
      if (y === undefined) return
      const at = (line: string) => out.push(`item ${x.id} ${json(x.title)}: ${line}`)
      if (x.id !== y.id) at(`id: PDF.js ${x.id}, engine ${y.id}`)
      if (x.title !== y.title)
        at(`title: PDF.js ${json(x.title)}, engine ${json(y.title)}`)
      for (const key of ['bold', 'italic', 'open'] as const)
        if (x[key] !== y[key]) at(`${key}: PDF.js ${x[key]}, engine ${y[key]}`)
      targetLine(x.target, y.target).forEach(at)
      if (x.children.length !== y.children.length)
        at(`children: PDF.js ${x.children.length}, engine ${y.children.length}`)
      walk(x.children, y.children)
    })
  }
  walk(a, b)
  return out
}
