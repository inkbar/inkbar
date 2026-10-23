import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q } from './dom.js'
import FindHarness from './harness/FindHarness.svelte'

const assets = browserAssets()
guardConsole()

const src = fixtureUrl('text-simple')
const BAR = '[data-ink-viewport-root] > [data-ink-find-bar]'
const COUNT = '[data-ink-find-count]'
const text = (selector: string) => () =>
  document.querySelector(selector)?.textContent?.trim() ?? null
const find = () => document.querySelector<HTMLButtonElement>('[data-ink-search-button]')!
const shown = (selector: string) => () => {
  const el = document.querySelector<HTMLElement>(selector)
  return !!el && !el.hidden
}
const ready = async () => {
  await q('[data-ink-scroll] .ink-page canvas')
}

describe('find bar', () => {
  it('Ctrl+F inside the root opens the bar, which finds and steps', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    await q(BAR)
    expect(shown(BAR)()).toBe(false)
    document.querySelector<HTMLElement>('[data-ink-scroll]')!.focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await expect.poll(shown(BAR)).toBe(true)
    const field = await q<HTMLInputElement>(`${BAR} input`)
    await expect.poll(focused).toBe(field)
    await userEvent.keyboard('QQ123456C')
    await expect.poll(text(COUNT)).toBe('1 of 3')
    await userEvent.keyboard('{Enter}')
    await expect.poll(text(COUNT)).toBe('2 of 3')
    await expect.poll(text('[data-ink-find-status]')).toBe('Match 2 of 3, page 2')
    await browserPage.getByRole('button', { name: 'Previous match' }).click()
    await expect.poll(text(COUNT)).toBe('1 of 3')
    await browserPage.getByRole('button', { name: 'Match case' }).click()
    await expect
      .poll(() => document.querySelector('[data-ink-find-match-case]')!.ariaPressed)
      .toBe('true')
  })

  it('Escape closes the bar and returns focus to the button that opened it', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    await q<HTMLElement>('[data-testid="outside"]').then((el) => el.focus())
    // A pointer click, which moves focus to the button first, as a user's does.
    await browserPage.elementLocator(find()).click()
    await expect.poll(focused).toBe(await q(`${BAR} input`))
    expect(find().getAttribute('aria-pressed')).toBe('true')
    await userEvent.keyboard('{Escape}')
    await expect.poll(shown(BAR)).toBe(false)
    expect(find().getAttribute('aria-pressed')).toBe('false')
    await expect.poll(focused).toBe(find())
  })

  it('Escape returns focus to the document when the key opened the bar from it', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    const scroll = await q('[data-ink-scroll]')
    scroll.focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await expect.poll(focused).toBe(await q(`${BAR} input`))
    await userEvent.keyboard('{Escape}')
    await expect.poll(focused).toBe(scroll)
  })

  it('leaves Ctrl+F to the browser with no bar mounted', async () => {
    await render(FindHarness, { src, assets, withBar: false })
    await ready()
    const e = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    ;(await q('[data-ink-scroll]')).dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(text('[data-testid="open"]')()).toBe('false')
  })

  it('useSearch().state follows setQuery', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    expect(text('[data-testid="query"]')()).toBe('')
    ;(await q('[data-testid="set-query"]')).click()
    await expect.poll(text('[data-testid="query"]')).toBe('Inkbar')
    // Setting the query does not open the bar.
    expect(text('[data-testid="open"]')()).toBe('false')
    await expect
      .poll(() => document.querySelector<HTMLInputElement>(`${BAR} input`)?.value)
      .toBe('Inkbar')
  })

  it('the search button is disabled until a document is open', async () => {
    await render(FindHarness, { src: null, assets })
    await q('[data-ink-search-button]')
    expect(find().disabled).toBe(true)
  })

  it('takes the selected page text as the query on Ctrl+F', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    await expect
      .poll(() =>
        [...document.querySelectorAll('[data-ink-text-layer] span')].some((s) =>
          s.textContent?.includes('QQ123456C')
        )
      )
      .toBe(true)
    const span = [...document.querySelectorAll('[data-ink-text-layer] span')].find((s) =>
      s.textContent?.includes('QQ123456C')
    )!
    const node = span.firstChild!
    const at = node.textContent!.indexOf('QQ123456C')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 'QQ123456C'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    ;(await q('[data-ink-scroll]')).focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    const field = await q<HTMLInputElement>(`${BAR} input`)
    await expect.poll(focused).toBe(field)
    expect(field.value).toBe('QQ123456C')
  })

  it('the live region follows each step, even two in one task', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    await browserPage.elementLocator(find()).click()
    await userEvent.keyboard('QQ123456C')
    const live = await q('[data-ink-find-status]')
    await expect.poll(() => live.textContent).toBe('Match 1 of 3, page 1')
    const seen: string[] = []
    const observer = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) seen.push(n.textContent ?? '')
    })
    observer.observe(live, { childList: true, characterData: true, subtree: true })
    ;(await q('[data-testid="there-and-back"]')).click()
    await new Promise((resolve) => setTimeout(resolve, 100))
    observer.disconnect()
    expect(seen).toEqual(['Match 2 of 3, page 2', 'Match 1 of 3, page 1'])
  })

  it('Escape in the bar stops before the root sees it', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    const root = await q('[data-ink-viewport-root]')
    let saw = false
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') saw = true
    })
    await browserPage.elementLocator(find()).click()
    await expect.poll(focused).toBe(await q(`${BAR} input`))
    await userEvent.keyboard('{Escape}')
    await expect.poll(shown(BAR)).toBe(false)
    expect(saw).toBe(false)
  })

  it('leaves nothing where the bar is written, and goes when unmounted', async () => {
    const view = await render(FindHarness, { src, assets })
    await ready()
    await q(BAR)
    expect((await q('[data-testid="bar-here"]')).children).toHaveLength(0)
    await view.rerender({ withBar: false })
    await expect.poll(() => document.querySelector('[data-ink-find-bar]')).toBeNull()
    await view.rerender({ withBar: true })
    await q(BAR)
    expect(document.querySelectorAll('[data-ink-find-bar]')).toHaveLength(1)
  })

  it("keeps the search button's own label over a caller's", async () => {
    await render(FindHarness, { src, assets })
    await q('[data-ink-search-button]')
    expect(find().getAttribute('aria-label')).toBe('Find')
    expect(find().getAttribute('title')).toBe('Find')
  })

  it('passes axe while open', async () => {
    await render(FindHarness, { src, assets })
    await ready()
    await browserPage.elementLocator(find()).click()
    await userEvent.keyboard('QQ123456C')
    await expect.poll(text(COUNT)).toBe('1 of 3')
    const results = await runAxe(document.querySelector(BAR)!)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })
})
