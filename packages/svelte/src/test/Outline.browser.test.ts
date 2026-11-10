import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q, qa } from './dom.js'
import OutlineHarness from './harness/OutlineHarness.svelte'

const assets = browserAssets()
guardConsole()

const props = { src: fixtureUrl('outline'), assets }
const TREE = '[role="tree"]'
const ITEM = `${TREE} [role="treeitem"]`
const item = (name: string) =>
  browserPage
    .getByRole('tree', { name: 'Outline' })
    .getByRole('treeitem', { name, exact: true })
/** The item's element by its title; the tree is read from the DOM, hidden items included. */
const el = (name: string): HTMLElement =>
  qa(ITEM).find(
    (e) => e.querySelector('.ink-outline-title')?.textContent?.trim() === name
  )!
const shown = (name: string) => () => el(name).checkVisibility()
const title = (name: string) => el(name).querySelector<HTMLElement>('.ink-outline-title')!
const toggle = (name: string) =>
  el(name).querySelector<HTMLElement>('.ink-outline-toggle')!
const current = () => document.querySelector('[data-testid="current"]')?.textContent
const back = () => browserPage.getByTestId('back')
const forward = () => browserPage.getByTestId('forward')

describe('outline', () => {
  it('outline in a panel navigates and marks current', async () => {
    await render(OutlineHarness, props)
    const tree = await q(TREE)
    await q(ITEM)
    expect(tree.getAttribute('aria-label')).toBe('Outline')
    await expect.element(item('Cover')).toHaveAttribute('aria-current', 'location')
    // "Part One" is closed in the file: its children are not shown until it opens.
    await expect.element(item('Part One')).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(shown('Chapter 1')).toBe(false)
    await expect.element(item('Part Two')).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(shown('Section A')).toBe(true)
    expect(document.querySelector('[data-testid="outline"]')!.classList).toContain(
      'ink-outline'
    )

    // The chevron toggles without following the item: the page stays and Back stays disabled.
    toggle('Part One').click()
    await expect.element(item('Part One')).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(shown('Chapter 1')).toBe(true)
    expect(current()).toBe('0')
    await expect.element(item('Cover')).toHaveAttribute('aria-current', 'location')
    await expect.element(back()).toBeDisabled()

    // A row click follows the item.
    title('Part Two').click()
    await expect.poll(current).toBe('2')
    await expect.element(item('Part Two')).toHaveAttribute('aria-current', 'location')
    expect(el('Cover').hasAttribute('aria-current')).toBe(false)

    const results = await runAxe(document.querySelector('[data-ink-outline]')!)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('arrow keys move focus', async () => {
    await render(OutlineHarness, props)
    await q(ITEM)
    await expect.element(item('Cover')).toHaveAttribute('tabindex', '0')
    el('Cover').focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(el('Part One'))
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(item('Part One')).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(el('Chapter 1'))
    await userEvent.keyboard('{ArrowLeft}')
    await expect.poll(focused).toBe(el('Part One'))
    expect(qa('[tabindex="0"]', document.querySelector(TREE)!)).toHaveLength(1)
    await userEvent.keyboard('{End}')
    await expect.poll(focused).toBe(el('Broken'))
    await userEvent.keyboard('{Home}')
    await userEvent.keyboard('{Enter}')
    expect(current()).toBe('0')
  })

  it('Enter on a non-current item activates it', async () => {
    await render(OutlineHarness, props)
    await q(ITEM)
    el('Cover').focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect.poll(focused).toBe(el('Part Two'))
    await userEvent.keyboard('{Enter}')
    await expect.poll(current).toBe('2')
    await expect.element(item('Part Two')).toHaveAttribute('aria-current', 'location')
    await expect.element(back()).toBeEnabled()
  })

  it('empty text', async () => {
    await render(OutlineHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      emptyText: 'Nothing here',
    })
    await expect.element(browserPage.getByText('Nothing here')).toBeVisible()
    expect(qa('[role="treeitem"]')).toHaveLength(0)
  })

  it('the item snippet replaces the title', async () => {
    await render(OutlineHarness, { ...props, slotted: true })
    await q(ITEM)
    const mark = (name: string) => el(name).querySelector<HTMLElement>('.harness-title')!
    await expect.poll(() => mark('Cover').dataset.current).toBe('true')
    expect(mark('Part One').dataset.expanded).toBe('false')
    expect(mark('Part One').textContent).toBe('Part One')
  })

  it('Back returns after an outline jump', async () => {
    await render(OutlineHarness, props)
    await q(ITEM)
    await expect.element(back()).toBeDisabled()
    await expect.element(forward()).toBeDisabled()
    await expect.element(back()).toHaveAttribute('aria-label', 'Back')
    await expect.element(forward()).toHaveAttribute('aria-label', 'Forward')
    title('Part Two').click()
    await expect.poll(current).toBe('2')
    await expect.element(back()).toBeEnabled()
    await back().click()
    await expect.poll(current).toBe('0')
    await expect.element(forward()).toBeEnabled()
    await forward().click()
    await expect.poll(current).toBe('2')
  })

  it('a new src shows its own tree and starts with Back disabled', async () => {
    await render(OutlineHarness, { ...props, otherSrc: fixtureUrl('text-simple') })
    await q(ITEM)
    title('Part Two').click()
    await expect.element(back()).toBeEnabled()

    await browserPage.getByTestId('open-other').click()
    await expect
      .element(browserPage.getByText('This document has no outline'))
      .toBeVisible()
    await expect.poll(() => qa('[role="treeitem"]').length).toBe(0)
    await expect.element(back()).toBeDisabled()
    await expect.element(forward()).toBeDisabled()

    await browserPage.getByTestId('open-first').click()
    await expect.element(item('Cover')).toBeVisible()
    // InkRoot keeps the page it reported, so the new viewer opens there: the tree marks
    // whichever item that is, and Back has nowhere to go.
    await expect.poll(() => qa('[aria-current="location"]').length).toBe(1)
    await expect.element(back()).toBeDisabled()
  })

  it('unmounting the outline destroys its controller', async () => {
    await render(OutlineHarness, props)
    await q(ITEM)
    await browserPage.getByTestId('toggle-outline').click()
    await expect.poll(() => document.querySelector(TREE)).toBeNull()
    // The viewport's scroll and resize reach nothing that was torn down.
    const scroller = document.querySelector<HTMLElement>('[data-ink-scroll]')!
    scroller.scrollTop = 300
    scroller.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 200))
    // And it builds again from the open document.
    await browserPage.getByTestId('toggle-outline').click()
    await expect.element(item('Cover')).toHaveAttribute('aria-current', 'location')
  })
})
