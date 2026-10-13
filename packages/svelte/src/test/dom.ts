import { vi } from 'vitest'

/**
 * CSS-selector helpers for the browser tests. Vitest's locators find by role, text and test id;
 * the component contract is expressed in data attributes and classes, so the suites read the
 * DOM directly and poll with `expect.poll` (its timeout is set in vitest.config.ts).
 */

/** Waits until `selector` matches under `root`, then returns the element. */
export function q<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): Promise<T> {
  return vi.waitUntil(() => root.querySelector<T>(selector), {
    timeout: 15_000,
    interval: 50,
  })
}

export function qa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T[] {
  return [...root.querySelectorAll<T>(selector)]
}

/** For `expect.poll`: an attribute of the first match, or null when nothing matches. */
export function attr(selector: string, name: string): () => string | null {
  return () => document.querySelector(selector)?.getAttribute(name) ?? null
}

export function count(selector: string): () => number {
  return () => document.querySelectorAll(selector).length
}

/** For `expect.poll`: a computed style property of the first match. */
export function cssOf(selector: string, property: string): () => string | null {
  return () => {
    const el = document.querySelector(selector)
    return el ? getComputedStyle(el).getPropertyValue(property) : null
  }
}

export function scrollTopOf(selector: string): () => number {
  return () => document.querySelector(selector)?.scrollTop ?? -1
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Holds every `fetch` whose URL contains `pattern` until `release()` is called. The PDF engine
 * loads URL sources with `fetch` on the main thread, so this stands in for Playwright's
 * `page.route` and keeps a document in `loading` for as long as a test needs.
 */
export function gateFetch(pattern: string): { release(): void; restore(): void } {
  const original = window.fetch.bind(window)
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes(pattern)) await gate
    return original(input, init)
  }
  return {
    release,
    restore() {
      window.fetch = original
    },
  }
}

/** For `expect.poll`: the focused element. */
export function focused(): Element | null {
  return document.activeElement
}
