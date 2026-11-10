import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { rectFromQuad, type Rect } from '../model/geometry'

import { createLinkLayer, type LinkLayer } from './link-layer'
import { createPageMount, type PageMount } from './page-mount'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createPageTransform, type ViewRotation } from './transform'
import { mountViewer } from './viewer-engine'

import type { LinkTarget } from '../model/destination'
import type { InkDocument } from '../model/document'
import type { PageLink } from '../model/links'
import type { FixtureName } from '@inkbar/fixtures/urls'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
})

function addTheme() {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  cleanup.push(() => style.remove())
}

async function open(name: FixtureName = 'links'): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

/** A page of `doc` mounted through `createPageMount`, inside a themed root. */
function mountPage(doc: InkDocument, page = 0, rotation: ViewRotation = 0) {
  addTheme()
  const transform = createPageTransform(doc.pages[page]!, 1, rotation)
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  host.dataset.inkRoot = ''
  host.style.setProperty('--total-scale-factor', String(transform.scale))
  const follow = vi.fn<(target: LinkTarget) => void>()
  const mount: PageMount = createPageMount({
    document: doc,
    page,
    host,
    transform,
    store: doc.annotations,
    devicePixelRatio: 1,
    followLink: follow,
  })
  cleanup.push(() => {
    mount.destroy()
    host.remove()
  })
  return { host, mount, transform, follow }
}

/** The link whose rect starts at user-space `y` on page 0. */
const linkAt = (doc: InkDocument, y: number, page = 0): PageLink =>
  doc.links(page).find((l) => l.rect.y === y)!

const elementsOf = (host: HTMLElement, link: PageLink) => [
  ...host.querySelectorAll<HTMLElement>(`[data-ink-link="${link.id}"]`),
]
const stopOf = (host: HTMLElement, link: PageLink) => elementsOf(host, link)[0]!

describe('link layer', () => {
  it('one element per link, placed over its rect', async () => {
    const doc = await open()
    for (const [page, rotation] of [
      [0, 0],
      [2, 0],
      [0, 90],
    ] as const) {
      const { host, transform } = mountPage(doc, page, rotation)
      const origin = host.getBoundingClientRect()
      for (const link of doc.links(page)) {
        const pieces: Rect[] = link.quads ? link.quads.map(rectFromQuad) : [link.rect]
        const els = elementsOf(host, link)
        expect(els).toHaveLength(pieces.length)
        pieces.forEach((piece, i) => {
          const want = transform.toCssRect(piece)
          const got = els[i]!.getBoundingClientRect()
          expect(Math.abs(got.left - origin.left - want.left)).toBeLessThan(1)
          expect(Math.abs(got.top - origin.top - want.top)).toBeLessThan(1)
          expect(Math.abs(got.width - want.width)).toBeLessThan(1)
          expect(Math.abs(got.height - want.height)).toBeLessThan(1)
          expect(els[i]!.classList.contains('ink-link')).toBe(true)
        })
      }
    }
  })

  it('moves its links when the page is zoomed', async () => {
    const doc = await open()
    const { host, mount } = mountPage(doc)
    const zoomed = createPageTransform(doc.pages[0]!, 1.5)
    mount.update(zoomed)
    const origin = host.getBoundingClientRect()
    const link = linkAt(doc, 462)
    elementsOf(host, link).forEach((el, i) => {
      const want = zoomed.toCssRect(rectFromQuad(link.quads![i]!))
      const got = el.getBoundingClientRect()
      expect(Math.abs(got.left - origin.left - want.left)).toBeLessThan(1)
      expect(Math.abs(got.top - origin.top - want.top)).toBeLessThan(1)
      expect(Math.abs(got.width - want.width)).toBeLessThan(1)
      expect(Math.abs(got.height - want.height)).toBeLessThan(1)
    })
  })

  it('names come from the text under the link', async () => {
    const doc = await open()
    const { host, mount } = mountPage(doc)
    await mount.textLayer.ready
    const name = (y: number) => stopOf(host, linkAt(doc, y)).getAttribute('aria-label')
    await until(() => name(696) === 'Chapter 2')
    expect(name(666)).toBe('Chapter 3')
    expect(name(636)).toBe('Example A')
    expect(name(576)).toBe('Next page')
    expect(name(462)).toBe('Wrapped link over two lines')
    const rotated = mountPage(doc, 2)
    await rotated.mount.textLayer.ready
    await until(
      () =>
        stopOf(rotated.host, doc.links(2)[0]!).getAttribute('aria-label') ===
        'Back to start'
    )
  })

  it('falls back to Go to page N', async () => {
    const doc = await open()
    const transform = createPageTransform(doc.pages[0]!, 1)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const layer: LinkLayer = createLinkLayer({
      host,
      page: 0,
      transform,
      document: doc,
      follow: () => {},
      textUnder: () => '',
    })
    cleanup.push(() => (layer.destroy(), host.remove()))
    const name = (y: number) => stopOf(host, linkAt(doc, y)).getAttribute('aria-label')
    await until(() => name(696) === 'Go to page 2' && name(666) === 'Go to page 3')
    expect(name(576)).toBe('Go to page 2')
    expect(name(636)).toBe('https://example.com/a')
    expect(name(462)).toBe('https://example.com/wrapped')
  })

  it('URL links are anchors with href', async () => {
    const doc = await open()
    const { host, follow } = mountPage(doc)
    const link = linkAt(doc, 636)
    const a = stopOf(host, link)
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('https://example.com/a')
    // A click (an assistive technology's "activate") is the host's to handle, never a visit.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(follow).toHaveBeenCalledExactlyOnceWith(link.target)
    // The second line of a wrapped link is decoration: hidden and never a stop.
    const [first, second] = elementsOf(host, linkAt(doc, 462))
    expect(first!.tagName).toBe('A')
    expect(second!.getAttribute('aria-hidden')).toBe('true')
    expect(second!.tabIndex).toBe(-1)
    expect(second!.hasAttribute('href')).toBe(false)
  })

  it('unsupported links are inert', async () => {
    const doc = await open()
    const { host, mount, follow } = mountPage(doc)
    for (const y of [606, 546, 516]) {
      const el = stopOf(host, linkAt(doc, y))
      expect(el.tagName).toBe('SPAN')
      expect(el.title).toBe('This link is not supported')
      expect(el.getAttribute('aria-disabled')).toBe('true')
      expect(el.tabIndex).toBe(-1)
      expect(mount.tabStops()).not.toContain(el)
      el.click()
    }
    expect(follow).not.toHaveBeenCalled()
    // Internal links are focusable links.
    const internal = stopOf(host, linkAt(doc, 696))
    expect(internal.tagName).toBe('SPAN')
    expect(internal.getAttribute('role')).toBe('link')
    expect(internal.tabIndex).toBe(0)
    expect(mount.tabStops()).toHaveLength(5)
  })

  it('a destination that names no page is inert', async () => {
    const doc = await open()
    const real = doc.links(0)
    const dead = (id: string, raw: string): PageLink => ({
      ...real[0]!,
      id,
      target: { kind: 'dest', raw },
    })
    vi.spyOn(doc, 'links').mockImplementation((page) =>
      page === 0
        ? [...real, dead('nowhere', 'no-such-name'), dead('broken', 'fails')]
        : []
    )
    const resolve = doc.resolveDestination.bind(doc)
    vi.spyOn(doc, 'resolveDestination').mockImplementation((raw) =>
      raw === 'fails' ? Promise.reject(new Error('unreadable')) : resolve(raw)
    )
    const { host, mount, follow } = mountPage(doc)
    for (const id of ['nowhere', 'broken']) {
      const el = host.querySelector<HTMLElement>(`[data-ink-link="${id}"]`)!
      await until(() => el.getAttribute('aria-disabled') === 'true')
      expect(el.tabIndex).toBe(-1)
      expect(el.title).toBe('This link is not supported')
      expect(mount.tabStops()).not.toContain(el)
      el.click()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
    expect(follow).not.toHaveBeenCalled()
  })

  it('Enter follows', async () => {
    const doc = await open()
    const { host, follow } = mountPage(doc)
    const internal = linkAt(doc, 696)
    stopOf(host, internal).focus()
    await userEvent.keyboard('{Enter}')
    expect(follow).toHaveBeenCalledExactlyOnceWith(internal.target)
    follow.mockClear()
    const url = linkAt(doc, 636)
    stopOf(host, url).focus()
    await userEvent.keyboard('{Enter}')
    expect(follow).toHaveBeenCalledExactlyOnceWith(url.target)
  })

  it('layer never takes pointer events', async () => {
    const doc = await open()
    const { host, mount, transform } = mountPage(doc)
    await mount.textLayer.ready
    const link = linkAt(doc, 696)
    const box = transform.toCssRect(link.rect)
    const origin = host.getBoundingClientRect()
    const hit = document.elementFromPoint(
      origin.left + box.left + box.width / 2,
      origin.top + box.top + box.height / 2
    )
    expect(hit?.closest('.ink-link')).toBeNull()
    expect(hit?.closest('.ink-text-layer')).not.toBeNull()
    expect(hit?.tagName).toBe('SPAN')
    expect(getComputedStyle(mount.links!.element).pointerEvents).toBe('none')
    expect(getComputedStyle(stopOf(host, link)).pointerEvents).toBe('none')
  })

  it('not mounted on pages without links', async () => {
    const doc = await open()
    const { host, mount } = mountPage(doc, 1)
    expect(mount.links).toBeUndefined()
    expect(host.querySelector('[data-ink-link-layer]')).toBeNull()
    // Where there are links, the layer sits over the text and under the annotations.
    const withLinks = mountPage(doc, 0)
    const layers = [...withLinks.host.children]
    const at = (sel: string) => layers.findIndex((el) => el.matches(sel))
    expect(at('[data-ink-link-layer]')).toBeGreaterThan(at('.ink-text-layer'))
    expect(at('[data-ink-link-layer]')).toBeLessThan(at('.ink-overlay'))
  })
})

describe('link tab order', () => {
  it('Tab interleaves links and fields on a page, then moves on to the next page', async () => {
    const doc = await open('form-fields')
    const at = (id: string, y: number): PageLink => ({
      id,
      page: 0,
      rect: { x: 72, y, width: 80, height: 10 },
      target: { kind: 'url', url: `https://example.com/${id}`, newWindow: false },
    })
    // One link above every field and one below them, as if the page listed them first.
    const fake = [at('link-top', 778), at('link-bottom', 2)]
    vi.spyOn(doc, 'links').mockImplementation((page) => (page === 0 ? fake : []))
    const container = mountContainer(800, 600)
    container.style.overflow = 'auto'
    const engine = mountViewer({ container, document: doc, zoom: 1, buffer: 0 })
    cleanup.push(() => (engine.destroy(), container.remove()))
    await until(() => container.querySelector('[data-ink-field="name"] input') !== null)
    const nameOf = (el: Element | null) =>
      el?.closest<HTMLElement>('[data-ink-widget]')?.dataset.inkField ??
      el?.closest<HTMLElement>('[data-ink-link]')?.dataset.inkLink
    const top = container.querySelector<HTMLElement>('[data-ink-link="link-top"]')!
    top.focus()
    await userEvent.keyboard('{Tab}')
    expect(nameOf(document.activeElement)).toBe('name')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(nameOf(document.activeElement)).toBe('link-top')
    container.querySelector<HTMLElement>('[data-ink-field="reset"] button')!.focus()
    await userEvent.keyboard('{Tab}')
    expect(nameOf(document.activeElement)).toBe('link-bottom')
    await userEvent.keyboard('{Tab}')
    expect(nameOf(document.activeElement)).toBe('header.ref')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(nameOf(document.activeElement)).toBe('link-bottom')
  })

  it('Tab into a page starts at its first stop, Shift+Tab at its last', async () => {
    const doc = await open('form-fields')
    const at = (id: string, y: number): PageLink => ({
      id,
      page: 0,
      rect: { x: 72, y, width: 80, height: 10 },
      target: { kind: 'url', url: `https://example.com/${id}`, newWindow: false },
    })
    // The first link is halfway down: fields above it come first in the page's order, though
    // the links come first in the DOM. The last stop is a link below every field.
    const fake = [at('link-mid', 400), at('link-bottom', 2)]
    vi.spyOn(doc, 'links').mockImplementation((page) => (page === 0 ? fake : []))
    const before = document.createElement('button')
    before.textContent = 'before'
    document.body.append(before)
    const container = mountContainer(800, 600)
    container.style.overflow = 'auto'
    const after = document.createElement('button')
    after.textContent = 'after'
    document.body.append(after)
    const engine = mountViewer({ container, document: doc, zoom: 1, buffer: 0 })
    cleanup.push(
      () => (engine.destroy(), container.remove(), before.remove(), after.remove())
    )
    await until(() => container.querySelector('[data-ink-field="name"] input') !== null)
    const nameOf = (el: Element | null) =>
      el?.closest<HTMLElement>('[data-ink-widget]')?.dataset.inkField ??
      el?.closest<HTMLElement>('[data-ink-link]')?.dataset.inkLink
    const onPage = () =>
      document.activeElement?.closest('[data-ink-form-layer], [data-ink-link-layer]')
    before.focus()
    for (let i = 0; i < 5 && !onPage(); i++) await userEvent.keyboard('{Tab}')
    expect(nameOf(document.activeElement)).toBe('name')
    after.focus()
    for (let i = 0; i < 5 && !onPage(); i++)
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(nameOf(document.activeElement)).toBe('link-bottom')
    // A press on a field is never moved.
    const city = container.querySelector<HTMLElement>('[data-ink-field="city"] input')!
    await userEvent.click(city)
    expect(nameOf(document.activeElement)).toBe('city')
  })

  it('Tab from the last link on a page goes to the next page that has links', async () => {
    const doc = await open()
    const container = mountContainer(800, 600)
    container.style.overflow = 'auto'
    const engine = mountViewer({ container, document: doc, zoom: 1, buffer: 0 })
    cleanup.push(() => (engine.destroy(), container.remove()))
    await until(() => container.querySelector('[data-ink-link-layer]') !== null)
    const last = doc
      .links(0)
      .filter((l) => l.target.kind !== 'unsupported')
      .at(-1)!
    container.querySelector<HTMLElement>(`[data-ink-link="${last.id}"]`)!.focus()
    await userEvent.keyboard('{Tab}')
    await until(
      () =>
        (document.activeElement as HTMLElement | null)?.dataset.inkLink ===
        doc.links(2)[0]!.id
    )
    expect(engine.pages.has(2)).toBe(true)
  })
})
