/*
 * The page's links as elements, for the keyboard and assistive technology only. The layer and
 * every link in it take no pointer events, so text selection, drags and every tool work as if
 * it weren't there; the viewer hit-tests links for the pointer instead. A link is an `<a href>`
 * when it opens a URL, so screen readers and link lists show the address, and a `role="link"`
 * span when it goes somewhere in the document. Following is always the viewer's: a click or
 * Enter calls `follow`, and an anchor's own navigation is cancelled.
 */
import { rectFromQuad, type Rect } from '../model/geometry'

import type { CssRect, PageTransform } from './transform'
import type { LinkTarget, NamedAction } from '../model/destination'
import type { InkDocument } from '../model/document'
import type { PageLink } from '../model/links'

export interface LinkLayerOptions {
  /** The page host (`div.ink-page`). */
  host: HTMLElement
  /** Zero-based page index. */
  page: number
  transform: PageTransform
  document: InkDocument
  /** Follows a link's target; the engine passes `Navigation.follow`. */
  follow(target: LinkTarget): void
  /** Text the text layer has under `rect`, or '' when none. */
  textUnder(rect: Rect): string
}

export interface LinkLayer {
  /** `div.ink-link-layer`, with `data-ink-link-layer`; never takes pointer events. */
  readonly element: HTMLElement
  update(transform: PageTransform): void
  /** The links Tab stops at, in the order the file lists them. */
  tabStops(): HTMLElement[]
  /** Reads each link's name from the text under it again, once the text layer has mounted. */
  relabel(): void
  destroy(): void
}

const UNSUPPORTED = 'This link is not supported'

/** The page a Named action goes to from the link's own page, as a reader on it would expect. */
function namedPage(action: NamedAction, page: number, count: number): number {
  const to =
    action === 'NextPage'
      ? page + 1
      : action === 'PrevPage'
        ? page - 1
        : action === 'FirstPage'
          ? 0
          : count - 1
  return Math.min(Math.max(to, 0), count - 1)
}

interface Entry {
  link: PageLink
  /** One per quad, or one for the rect; the first is the Tab stop and carries the name. */
  pieces: { el: HTMLElement; rect: Rect }[]
  /** The text under the link, trimmed. */
  text: string
  /** The page an internal link goes to, once known. */
  to: number | undefined
}

/** Draws `page`'s links (`document.links(page)`) over the page in `host`. */
export function createLinkLayer(opts: LinkLayerOptions): LinkLayer {
  const { host, page, document: doc } = opts
  const ownerDoc = host.ownerDocument
  let transform = opts.transform
  let destroyed = false

  const element = ownerDoc.createElement('div')
  element.className = 'ink-link-layer'
  element.dataset.inkLinkLayer = ''
  element.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  host.append(element)

  const name = (e: Entry): string => {
    if (e.text) return e.text
    const target = e.link.target
    if (target.kind === 'url') return target.url
    if (target.kind === 'unsupported') return UNSUPPORTED
    // Until the destination is looked up, the page is not known.
    return e.to === undefined ? 'Go to link' : `Go to page ${e.to + 1}`
  }

  const place = (el: HTMLElement, rect: Rect) => {
    const box: CssRect = transform.toCssRect(rect)
    el.style.left = `${box.left}px`
    el.style.top = `${box.top}px`
    el.style.width = `${box.width}px`
    el.style.height = `${box.height}px`
  }

  const follow = (e: Entry) => {
    if (!destroyed && e.link.target.kind !== 'unsupported') opts.follow(e.link.target)
  }

  /** Marks every piece of a wrapped link while its stop has a visible focus ring. */
  const markFocus = (e: Entry, on: boolean) => {
    for (const { el } of e.pieces) el.toggleAttribute('data-ink-focused', on)
  }

  const readText = (e: Entry) =>
    e.pieces
      .map((p) => opts.textUnder(p.rect).trim())
      .filter(Boolean)
      .join(' ')

  const entries: Entry[] = doc.links(page).map((link) => {
    const target = link.target
    const rects = link.quads?.length ? link.quads.map(rectFromQuad) : [link.rect]
    const e: Entry = {
      link,
      pieces: [],
      text: '',
      to:
        target.kind === 'resolved'
          ? target.dest.page
          : target.kind === 'named'
            ? namedPage(target.action, page, doc.pages.length)
            : undefined,
    }
    rects.forEach((rect, i) => {
      const stop = i === 0
      let el: HTMLElement
      if (stop && target.kind === 'url') {
        const a = ownerDoc.createElement('a')
        a.href = target.url
        el = a
      } else {
        el = ownerDoc.createElement('span')
        if (!stop) {
          // A wrapped link's further lines only extend its outline: one stop, one name.
          el.setAttribute('aria-hidden', 'true')
        } else {
          el.setAttribute('role', 'link')
          if (target.kind === 'unsupported') {
            el.title = UNSUPPORTED
            el.setAttribute('aria-disabled', 'true')
            el.tabIndex = -1
          } else el.tabIndex = 0
        }
      }
      el.className = 'ink-link'
      el.dataset.inkLink = link.id
      el.style.cssText = 'position:absolute;pointer-events:none;'
      place(el, rect)
      element.append(el)
      e.pieces.push({ el, rect })
    })
    const stop = e.pieces[0]!.el
    stop.setAttribute('aria-label', name(e))
    // An assistive technology's "activate" is a click; Enter on an anchor is one too.
    stop.addEventListener('click', (ev) => {
      ev.preventDefault()
      follow(e)
    })
    if (stop.tagName !== 'A')
      stop.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' || ev.defaultPrevented) return
        ev.preventDefault()
        follow(e)
      })
    stop.addEventListener('focus', () => markFocus(e, stop.matches(':focus-visible')))
    stop.addEventListener('blur', () => markFocus(e, false))
    return e
  })

  const relabel = () => {
    if (destroyed) return
    for (const e of entries) {
      e.text = readText(e)
      e.pieces[0]!.el.setAttribute('aria-label', name(e))
    }
  }
  relabel()

  // Destinations are looked up now, not at load, so a page of an index with thousands of links
  // costs only when it shows. The document caches each answer for when the link is followed.
  for (const e of entries) {
    const target = e.link.target
    if (target.kind !== 'dest') continue
    doc
      .resolveDestination(target.raw)
      .then((dest) => {
        if (destroyed || !dest) return
        e.to = dest.page
        e.pieces[0]!.el.setAttribute('aria-label', name(e))
      })
      .catch(() => {})
  }

  return {
    element,
    update(next) {
      if (destroyed) return
      transform = next
      for (const e of entries) for (const p of e.pieces) place(p.el, p.rect)
    },
    tabStops() {
      if (destroyed) return []
      return entries.flatMap((e) => {
        const stop = e.pieces[0]!.el
        return stop.tabIndex >= 0 ? [stop] : []
      })
    },
    relabel,
    destroy() {
      if (destroyed) return
      destroyed = true
      element.remove()
    },
  }
}

/**
 * The text of `layer` (a text layer) whose characters sit in `box`, a client-coordinate box.
 * Text runs that lie wholly inside count whole; runs that cross the edge count the characters
 * whose centre is inside, so a link over one word of a line is named by that word.
 */
export function textInBox(
  layer: HTMLElement,
  box: { left: number; top: number; right: number; bottom: number }
): string {
  const ownerDoc = layer.ownerDocument
  const inside = (x: number, y: number) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  const walker = ownerDoc.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  const range = ownerDoc.createRange()
  const parts: string[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const run = text.parentElement?.getBoundingClientRect()
    if (
      !run ||
      run.right < box.left ||
      run.left > box.right ||
      run.bottom < box.top ||
      run.top > box.bottom
    )
      continue
    let out = ''
    if (
      run.left >= box.left &&
      run.right <= box.right &&
      run.top >= box.top &&
      run.bottom <= box.bottom
    )
      out = text.data
    else
      for (let i = 0; i < text.data.length; i++) {
        range.setStart(text, i)
        range.setEnd(text, i + 1)
        const c = range.getBoundingClientRect()
        if (inside(c.left + c.width / 2, c.top + c.height / 2)) out += text.data[i]
      }
    if (out.trim()) parts.push(out.trim())
  }
  return parts.join(' ').replace(/\s+/g, ' ')
}
