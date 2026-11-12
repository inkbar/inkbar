import { browserAssets } from '@inkbar/fixtures/urls'
import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q, qa } from './dom.js'
import SidebarHarness from './harness/SidebarHarness.svelte'
import { renderHydrated } from './hydrate.js'

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
    expect(
      panel('Pages')
        .element()
        .querySelector('.ink-sidebar-panel-body')!
        .textContent.trim()
    ).toBe('Pages content')
    // The rail shows the open panel's title, which the rail button carries for assistive technology.
    await expect
      .element(
        panel('Pages').element().querySelector<HTMLElement>('.ink-sidebar-panel-title')
      )
      .toBeVisible()
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
    expect(
      region('Pages')
        .element()
        .querySelector('.ink-sidebar-panel-body')!
        .textContent.trim()
    ).toBe('Pages content')
    // A stack's header names the section: no title.
    await expect
      .element(
        region('Pages').element().querySelector<HTMLElement>('.ink-sidebar-panel-title')
      )
      .not.toBeVisible()

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
    expect(
      region('Notes')
        .element()
        .querySelector('.ink-sidebar-panel-body')!
        .textContent.trim()
    ).toBe('Notes content')
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

describe('sidebar width', () => {
  const handle = () =>
    browserPage.getByRole('separator', { name: /^Resize (left|right) sidebar$/ })
  const sidebarEl = () => document.querySelector<HTMLElement>(SIDEBAR)!
  const styleWidth = () => sidebarEl().style.getPropertyValue('--ink-sidebar-width')
  const boxWidth = () => sidebarEl().getBoundingClientRect().width

  /** Drags the handle `dx` CSS px with the mouse. */
  function drag(dx: number): void {
    const box = handle().element().getBoundingClientRect()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    handle()
      .element()
      .dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
        })
      )
    for (const step of [dx / 2, dx])
      handle()
        .element()
        .dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            buttons: 1,
            clientX: x + step,
            clientY: y,
          })
        )
    handle()
      .element()
      .dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x + dx,
          clientY: y,
        })
      )
  }

  it('drag widens and remounting with the same storage keeps it', async () => {
    await render(SidebarHarness, { layout: 'rail', stored: {} })
    const root = await q(SIDEBAR)
    // The handle is the root's last child and names the panels it resizes.
    const last = root.lastElementChild!
    expect(last.classList.contains('ink-sidebar-handle')).toBe(true)
    expect(last.getAttribute('role')).toBe('separator')
    const panelsId = root.querySelector('.ink-sidebar-panels')!.getAttribute('id')
    expect(panelsId).toBeTruthy()
    await expect.element(handle()).toHaveAttribute('aria-controls', panelsId!)
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '320')
    expect(styleWidth()).toBe('320px')
    const before = boxWidth()

    drag(80)
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '400')
    expect(styleWidth()).toBe('400px')
    // The theme lays it out at the new width.
    expect(boxWidth()).toBe(before + 80)
    await expect.poll(text('stored')).toBe('{"sidebar.left.width":400}')

    await browserPage.getByTestId('remount').click()
    await expect.poll(() => document.querySelector(SIDEBAR)).toBeNull()
    await browserPage.getByTestId('remount').click()
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '400')
    expect(styleWidth()).toBe('400px')
    await noAxeViolations()
  })

  it('keyboard resizes', async () => {
    await render(SidebarHarness, { layout: 'tabs', side: 'right', stored: {} })
    handle().element().focus()
    // On a right sidebar, ArrowLeft is wider.
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '336')
    expect(styleWidth()).toBe('336px')
    await expect.poll(text('stored')).toBe('{"sidebar.right.width":336}')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '304')
    await userEvent.keyboard('{End}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '480')
    await userEvent.keyboard('{Home}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '240')
    expect(styleWidth()).toBe('240px')
    // Enter resets and forgets the saved width.
    await userEvent.keyboard('{Enter}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '320')
    await expect.poll(text('stored')).toBe('{}')
  })

  it('bind:width is controlled and storage untouched', async () => {
    await render(SidebarHarness, {
      layout: 'rail',
      width: 300,
      stored: { 'sidebar.left.width': 450 },
    })
    // The bound number wins over the saved width.
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '300')
    expect(styleWidth()).toBe('300px')
    drag(60)
    await expect.poll(text('width')).toBe('360')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '360')
    expect(styleWidth()).toBe('360px')
    handle().element().focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(text('width')).toBe('376')
    expect(text('stored')()).toBe('{"sidebar.left.width":450}')
  })

  it('a bound width set back to undefined stays controlled', async () => {
    await render(SidebarHarness, { layout: 'rail', width: 300, stored: {} })
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '300')
    await browserPage.getByTestId('clear-width').click()
    await expect.poll(text('width')).toBe('null')
    drag(60)
    await expect.poll(text('width')).toBe('360')
    // The handle follows the binding rather than freezing.
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '360')
    drag(20)
    await expect.poll(text('width')).toBe('380')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '380')
    expect(text('stored')()).toBe('{}')
  })

  it('a bound width that starts undefined only reports and keeps saving', async () => {
    await render(SidebarHarness, { layout: 'rail', bindWidth: true, stored: {} })
    handle().element().focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(text('width')).toBe('336')
    await expect.poll(text('stored')).toBe('{"sidebar.left.width":336}')
    // Still uncontrolled after its own write came back: the next key saves too.
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(text('stored')).toBe('{"sidebar.left.width":352}')
  })

  it('an unbound sidebar keeps saving after the first drag', async () => {
    await render(SidebarHarness, { layout: 'rail', stored: {} })
    handle().element().focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await expect.poll(text('stored')).toBe('{"sidebar.left.width":352}')
  })

  it('InkSidebar inside InkRoot uses the root storage', async () => {
    await render(SidebarHarness, {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      stored: { 'sidebar.left.width': 360 },
    })
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '360')
    expect(styleWidth()).toBe('360px')
    handle().element().focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(text('stored')).toBe('{"sidebar.left.width":376}')
  })

  it('InkRoot signatures go through storage', async () => {
    const template = {
      id: 'kept',
      kind: 'image',
      imagedata: 'data:image/png;base64,AA==',
      aspect: 2,
    }
    await render(SidebarHarness, {
      inRoot: true,
      assets: browserAssets(),
      stored: { signatures: [template] },
    })
    await expect.poll(text('signatures')).toBe('1')
    await browserPage.getByTestId('save-signature').click()
    await expect.poll(text('signatures')).toBe('2')
    const stored = JSON.parse(text('stored')()!) as { signatures: { id: string }[] }
    expect(stored.signatures.map((t) => t.id)).toEqual(['kept', 'added'])
  })
})

describe('floating sidebar', () => {
  const sidebarEl = () => document.querySelector<HTMLElement>(SIDEBAR)
  const state = () => sidebarEl()?.dataset.state
  const overlay = () => sidebarEl()?.hasAttribute('data-overlay')
  const pagesContent = () => browserPage.getByText('Pages content')
  /** Clicks the pages near their far edge, clear of a floating panel. */
  async function tapPages(): Promise<void> {
    const box = document.querySelector('[data-testid="pages"]')!.getBoundingClientRect()
    await browserPage
      .getByTestId('pages')
      .click({ position: { x: box.width - 20, y: 20 } })
  }

  it('floats in a narrow container and closes on a tap on the pages', async () => {
    await render(SidebarHarness, { layout: 'rail', containerWidth: 600 })
    // No room at the first measurement: the panel starts closed.
    await expect.poll(state).toBe('closed')
    expect(overlay()).toBe(false)
    await tab('Pages').click()
    await expect.poll(overlay).toBe(true)
    await expect.element(panel('Pages')).toBeVisible()
    // The pages keep their room.
    expect(
      document.querySelector('[data-testid="pages"]')!.getBoundingClientRect().width
    ).toBeGreaterThanOrEqual(480)

    await tapPages()
    await expect.poll(state).toBe('closed')
    expect(overlay()).toBe(false)
    await expect.element(pagesContent()).not.toBeVisible()
  })

  it('inherits minDocumentWidth from InkRoot', async () => {
    // 900px leaves the default 480 room; the root asks for 700.
    await render(SidebarHarness, {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      containerWidth: 900,
      rootMinDocumentWidth: 700,
    })
    await expect.poll(state).toBe('closed')
    await tab('Pages').click()
    await expect.poll(overlay).toBe(true)
  })

  it("the sidebar's minDocumentWidth wins over InkRoot's", async () => {
    await render(SidebarHarness, {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      containerWidth: 900,
      rootMinDocumentWidth: 700,
      minDocumentWidth: 400,
    })
    await expect.element(panel('Pages')).toBeVisible()
    expect(state()).toBe('open')
    expect(overlay()).toBe(false)
  })

  it('handleLabel names the handle', async () => {
    await render(SidebarHarness, { layout: 'rail', handleLabel: 'Resize the pages list' })
    await expect
      .element(browserPage.getByRole('separator', { name: 'Resize the pages list' }))
      .toHaveAttribute('aria-valuenow', '320')
  })

  it('starts closed after hydration without a mismatch', async () => {
    const html = await renderHydrated('SidebarHarness.svelte', SidebarHarness, {
      layout: 'rail',
      containerWidth: 500,
    })
    // The server showed the panel beside the pages.
    expect(html).toMatch(/class="ink-sidebar"[^>]*data-state="open"/)
    await expect.poll(state).toBe('closed')
    await expect.element(pagesContent()).not.toBeVisible()
    // The console guard fails the test on a hydration warning.
  })

  it('a bound open reports the close', async () => {
    await render(SidebarHarness, { layout: 'rail', open: 'pages', containerWidth: 500 })
    // Controlled: it stays open, floating.
    await expect.poll(overlay).toBe(true)
    expect(text('open')()).toBe('"pages"')
    await userEvent.keyboard('{Escape}')
    await expect.poll(text('open')).toBe('null')
    await expect.poll(state).toBe('closed')
    await tab('Pages').click()
    await expect.poll(text('open')).toBe('"pages"')
    await tapPages()
    await expect.poll(text('open')).toBe('null')
    await expect.element(pagesContent()).not.toBeVisible()
  })
})
