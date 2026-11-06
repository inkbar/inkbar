import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q, qa } from './dom.js'
import SidebarHarness from './harness/SidebarHarness.svelte'

guardConsole()

const SIDEBAR = '[data-testid="sidebar"]'
const tab = (name: string) => browserPage.getByRole('tab', { name, exact: true })
const panel = (name: string) => browserPage.getByRole('tabpanel', { name })
const region = (name: string) => browserPage.getByRole('region', { name })
const header = (name: string) => browserPage.getByRole('button', { name, exact: true })
const query = () => browserPage.getByRole('textbox', { name: 'Query' })
const queryField = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Query"]')
const shown = (selector: string) => () => {
  const el = document.querySelector<HTMLElement>(selector)
  return !!el && el.checkVisibility()
}
const text = (testId: string) => () =>
  document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
const tabs = () => qa<HTMLButtonElement>(`${SIDEBAR} [role="tablist"] [role="tab"]`)
const tabTexts = () => tabs().map((t) => t.textContent?.trim())

async function noAxeViolations(): Promise<void> {
  const results = await runAxe(document.querySelector(SIDEBAR)!)
  expect(results.violations.map((v) => v.id)).toEqual([])
}

describe('sidebar', () => {
  it('rail, tabs and stack render and switch by mouse and keyboard (rail)', async () => {
    await render(SidebarHarness, { layout: 'rail' })
    const sidebar = await q(SIDEBAR)
    expect(sidebar.dataset.layout).toBe('rail')
    expect(sidebar.dataset.side).toBe('left')
    const list = await q(`${SIDEBAR} [role="tablist"]`)
    expect(list.getAttribute('aria-orientation')).toBe('vertical')
    expect(list.classList.contains('ink-sidebar-rail')).toBe(true)
    await expect.poll(() => tabs().length).toBe(3)
    // Icons only on the rail, the label in the tooltip; the badge joins the name.
    const [first, second] = tabs()
    expect(first!.title).toBe('Pages')
    expect(first!.querySelectorAll('svg.ink-icon')).toHaveLength(1)
    expect(first!.querySelectorAll('.ink-sidebar-label')).toHaveLength(0)
    await expect.element(tab('Search, 3')).toBeVisible()
    expect(second!.querySelector('.ink-sidebar-badge')!.textContent).toBe('3')
    expect(first!.querySelector<HTMLElement>('.ink-sidebar-badge')!.hidden).toBe(true)
    // The first panel starts open.
    await expect.element(tab('Pages')).toHaveAttribute('aria-selected', 'true')
    await expect.element(panel('Pages')).toHaveTextContent('Pages content')
    await expect.element(panel('Pages')).toHaveClass('ink-sidebar-panel')

    await tab('Notes').click()
    await expect.element(panel('Notes')).toBeVisible()
    await expect.element(browserPage.getByText('Pages content')).not.toBeVisible()
    // Arrow keys move focus only; Enter opens.
    await userEvent.keyboard('{ArrowUp}')
    await expect.poll(focused).toBe(tab('Search, 3').element())
    await expect.element(panel('Notes')).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect.element(tab('Search, 3')).toHaveAttribute('aria-selected', 'true')
    await expect.element(query()).toBeVisible()
    // One Tab stop in the rail.
    expect(tabs().filter((t) => t.tabIndex === 0)).toHaveLength(1)
    // Activating the open panel's icon closes it.
    await userEvent.keyboard('[Space]')
    await expect.poll(() => sidebar.dataset.state).toBe('closed')
    await expect.poll(shown('input[aria-label="Query"]')).toBe(false)
    // A badge of 0 hides.
    await browserPage.getByTestId('clear-badge').click()
    await expect.element(tab('Search')).toBeVisible()
    expect(tabs()[1]!.querySelector<HTMLElement>('.ink-sidebar-badge')!.hidden).toBe(true)

    await tab('Pages').click()
    await noAxeViolations()
  })

  it('rail, tabs and stack render and switch by mouse and keyboard (tabs)', async () => {
    await render(SidebarHarness, { layout: 'tabs', side: 'right' })
    const sidebar = await q(SIDEBAR)
    expect(sidebar.dataset.side).toBe('right')
    const list = await q(`${SIDEBAR} [role="tablist"]`)
    expect(list.getAttribute('aria-orientation')).toBe('horizontal')
    expect(list.classList.contains('ink-sidebar-tabs')).toBe(true)
    // Tabs show their labels.
    await expect
      .poll(() => qa('.ink-sidebar-label', list).map((l) => l.textContent))
      .toEqual(['Pages', 'Search', 'Notes'])
    await expect.element(panel('Pages')).toBeVisible()

    await tab('Search, 3').click()
    await expect.element(query()).toBeVisible()
    // The open tab stays open when activated again.
    await tab('Search, 3').click()
    await expect.element(query()).toBeVisible()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(tab('Notes').element())
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(tab('Pages').element())
    await userEvent.keyboard('{End}')
    await expect.poll(focused).toBe(tab('Notes').element())
    await userEvent.keyboard('{Enter}')
    await expect.element(panel('Notes')).toBeVisible()
    await expect.poll(shown('input[aria-label="Query"]')).toBe(false)

    await noAxeViolations()
  })

  it('rail, tabs and stack render and switch by mouse and keyboard (stack)', async () => {
    await render(SidebarHarness, { layout: 'stack' })
    await q(SIDEBAR)
    expect(document.querySelector('[role="tablist"]')).toBeNull()
    const headers = () => qa('.ink-sidebar-section > .ink-sidebar-header')
    await expect.poll(() => headers().length).toBe(3)
    expect(
      headers().map((h) => h.querySelector('.ink-sidebar-label')?.textContent)
    ).toEqual(['Pages', 'Search', 'Notes'])
    const pages = header('Pages')
    const search = header('Search, 3')
    const notes = header('Notes')
    await expect.element(pages).toHaveAttribute('aria-expanded', 'true')
    await expect.element(search).toHaveAttribute('aria-expanded', 'false')
    await expect.element(region('Pages')).toHaveTextContent('Pages content')

    // Any number expanded.
    await search.click()
    await expect.element(search).toHaveAttribute('aria-expanded', 'true')
    await expect.element(query()).toBeVisible()
    await expect.element(region('Pages')).toBeVisible()
    // Every header is a Tab stop; Enter and Space toggle.
    ;(pages.element() as HTMLElement).focus()
    await userEvent.tab()
    await expect.poll(focused).toBe(search.element())
    await userEvent.tab()
    // Past the open Search panel's field.
    await userEvent.tab()
    await expect.poll(focused).toBe(notes.element())
    await userEvent.keyboard('{Enter}')
    await expect.element(region('Notes')).toHaveTextContent('Notes content')
    ;(pages.element() as HTMLElement).focus()
    await userEvent.keyboard('[Space]')
    await expect.element(pages).toHaveAttribute('aria-expanded', 'false')
    await expect.element(browserPage.getByText('Pages content')).not.toBeVisible()

    await noAxeViolations()
  })

  it('bind:open is honoured and updated', async () => {
    await render(SidebarHarness, { layout: 'rail', open: 'search' })
    await expect.element(query()).toBeVisible()
    await expect.element(browserPage.getByText('Pages content')).not.toBeVisible()
    await tab('Notes').click()
    await expect.poll(text('open')).toBe('"notes"')
    await expect.element(panel('Notes')).toBeVisible()
    await tab('Notes').click()
    await expect.poll(text('open')).toBe('null')
    await expect
      .poll(() => document.querySelector<HTMLElement>(SIDEBAR)!.dataset.state)
      .toBe('closed')
    // The host opens a panel from code.
    await browserPage.getByTestId('open-notes').click()
    await expect.element(panel('Notes')).toBeVisible()
  })

  it('bind:open is honoured and updated (stack)', async () => {
    await render(SidebarHarness, { layout: 'stack', open: ['search', 'notes'] })
    await expect.element(region('Notes')).toBeVisible()
    await expect.element(browserPage.getByText('Pages content')).not.toBeVisible()
    await header('Pages').click()
    await expect.poll(text('open')).toBe('["pages","search","notes"]')
    await browserPage.getByTestId('open-notes').click()
    await expect.poll(shown('input[aria-label="Query"]')).toBe(false)
    await expect.element(header('Notes')).toHaveAttribute('aria-expanded', 'true')
  })

  it('an {#if}-removed open panel falls back', async () => {
    await render(SidebarHarness, { layout: 'tabs', open: 'search' })
    await expect.element(query()).toBeVisible()
    await browserPage.getByTestId('toggle-search').click()
    await expect.poll(() => tabs().length).toBe(2)
    // The first remaining panel opens and the bound value hears of it.
    await expect.element(panel('Pages')).toBeVisible()
    await expect.poll(text('open')).toBe('"pages"')
    // Back in, it takes its place in DOM order, not at the end.
    await browserPage.getByTestId('toggle-search').click()
    await expect.poll(tabTexts).toEqual(['Pages', 'Search3', 'Notes'])
    await expect.element(panel('Pages')).toBeVisible()
  })

  it('an {#if}-removed open panel falls back (uncontrolled)', async () => {
    await render(SidebarHarness, { layout: 'rail' })
    await tab('Search, 3').click()
    await expect.element(query()).toBeVisible()
    await browserPage.getByTestId('toggle-search').click()
    await expect.poll(() => tabs().length).toBe(2)
    await expect.element(panel('Pages')).toBeVisible()
  })

  it('panel content keeps its state when hidden', async () => {
    await render(SidebarHarness, { layout: 'tabs' })
    await tab('Search, 3').click()
    await query().fill('kept')
    await tab('Notes').click()
    await expect.poll(shown('input[aria-label="Query"]')).toBe(false)
    // Hidden, not unmounted.
    expect(qa('input[aria-label="Query"]')).toHaveLength(1)
    const field = queryField()
    await tab('Search, 3').click()
    await expect.element(query()).toHaveValue('kept')
    expect(queryField()).toBe(field)
  })
  it('unmounting the whole sidebar leaves the bound open value as it was', async () => {
    await render(SidebarHarness, { layout: 'tabs', open: 'search' })
    await expect.element(query()).toBeVisible()
    await browserPage.getByTestId('toggle-sidebar').click()
    await expect.poll(() => document.querySelector(SIDEBAR)).toBeNull()
    expect(text('open')()).toBe('"search"')
    await browserPage.getByTestId('toggle-sidebar').click()
    await expect.element(query()).toBeVisible()
    await expect.element(tab('Search, 3')).toHaveAttribute('aria-selected', 'true')
    expect(text('open')()).toBe('"search"')
  })
})
