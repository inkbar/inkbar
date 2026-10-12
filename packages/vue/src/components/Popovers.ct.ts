import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/PopoverHarness.vue'

import type { Locator } from '@playwright/test'

const assets = browserAssets()
guardConsole(test)

type Stored = { id: string; type: string; contents?: string; inReplyTo?: string }
type DocHandle = {
  annotations: {
    add(input: unknown): { id: string }
    list: { get(): Stored[] }
    selection: { get(): string[] }
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }

const stored = (root: Locator) =>
  root.evaluate((el) => (el as RootEl).__inkDocument!.annotations.list.get())

/** Annotation elements ignore the pointer; their drawn shape takes the press. */
const hitShape = (annotation: Locator) =>
  annotation.locator('svg rect, svg polygon').first()

test('note popover opens on activation, shows the thread, adds a reply and closes', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('annotated-notes-threaded'), assets },
  })
  const root = page.locator('[data-ink-root]')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(4)
  const rootNote = (await stored(root)).find((a) => a.contents === 'Root note')!
  const anchor = cmp.locator(`[data-annotation="${rootNote.id}"]`)
  await anchor.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-note-popover]')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('role', 'dialog')
  await expect(popover).toHaveAccessibleName('Note thread')
  const items = popover.locator('[data-ink-thread-item]')
  await expect(items).toHaveCount(3)
  await expect(items.first()).toContainText('Root note')
  // Embedded notes are locked: no Delete.
  await expect(popover.getByRole('button', { name: 'Delete' })).toHaveCount(0)

  await popover.locator('textarea[aria-label="Reply"]').fill('Looks fine')
  await popover.getByRole('button', { name: 'Reply' }).click()
  await expect(items).toHaveCount(4)
  await expect(items.last()).toContainText('Looks fine')
  const reply = (await stored(root)).find((a) => a.contents === 'Looks fine')
  expect(reply).toMatchObject({ type: 'note', inReplyTo: rootNote.id })
  await expect(popover.locator('textarea[aria-label="Reply"]')).toHaveValue('')

  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  await expect(anchor).toBeFocused()
})

test('note popover keeps focus inside, closes on Escape and can reopen', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('annotated-notes-threaded'), assets },
  })
  const root = page.locator('[data-ink-root]')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(4)
  const rootNote = (await stored(root)).find((a) => a.contents === 'Root note')!
  const anchor = cmp.locator(`[data-annotation="${rootNote.id}"]`)
  await anchor.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-note-popover]')
  await expect(popover).toBeVisible()
  const textarea = popover.locator('textarea[aria-label="Reply"]')
  await textarea.focus()
  await textarea.fill('x')
  // Tab cycles inside the popover: textarea, Reply, Close, then back round.
  await page.keyboard.press('Tab')
  await expect(popover.getByRole('button', { name: 'Reply' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(popover.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(textarea).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(anchor).toBeFocused()
  // Escape cleared the activated annotation, so activating it again reopens the popover.
  await page.keyboard.press('Enter')
  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-ink-thread-item]')).toHaveCount(3)
})

test('suggestion card accepts into a user redaction and dismisses', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, seedSuggestions: true },
  })
  const suggested = cmp.locator('[data-annotation][data-origin="suggested"]')
  await expect(suggested).toHaveCount(2)
  await hitShape(suggested.first()).click()
  const card = page.locator('[data-ink-suggestion-card]')
  await expect(card).toBeVisible()
  await expect(card).toHaveAccessibleName('Suggested redaction')
  await expect(card).toContainText('third-party name')
  await expect(card).toContainText('Names a person other than the data subject.')
  await expect(card.locator('[data-confidence]')).toHaveAttribute(
    'data-confidence',
    'high'
  )
  await card.getByRole('button', { name: 'Accept' }).click()
  await expect(
    cmp.locator('[data-annotation][data-origin="user"][data-type="redact"]')
  ).toHaveCount(1)
  await expect(card).toHaveCount(0)

  await hitShape(suggested.first()).click()
  await expect(card.locator('[data-confidence]')).toHaveAttribute(
    'data-confidence',
    'low'
  )
  await card.getByRole('button', { name: 'Dismiss' }).click()
  await expect(suggested).toHaveCount(0)
  await expect(card).toHaveCount(0)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
  // No suggestion follows it: focus goes to the previous annotation, the accepted one.
  await expect(cmp.locator('[data-annotation][data-origin="user"]')).toBeFocused()
})

test('suggestion card opens from the keyboard and Escape closes it and clears the selection', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, seedSuggestions: true },
  })
  const root = page.locator('[data-ink-root]')
  const first = cmp.locator('[data-annotation][data-origin="suggested"]').first()
  await expect(first).toHaveCount(1)
  await first.focus()
  await page.keyboard.press('Enter')
  const card = page.locator('[data-ink-suggestion-card]')
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('data-state', 'idle')
  expect(
    await root.evaluate((el) => (el as RootEl).__inkDocument!.annotations.selection.get())
  ).toEqual([])
})

test('after a dismiss, focus moves to the next suggestion, then to the document', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, seedSuggestions: true },
  })
  const suggested = cmp.locator('[data-annotation][data-origin="suggested"]')
  await expect(suggested).toHaveCount(2)
  const secondId = await suggested.nth(1).getAttribute('data-annotation')
  await suggested.first().focus()
  await page.keyboard.press('Enter')
  const card = page.locator('[data-ink-suggestion-card]')
  await card.getByRole('button', { name: 'Dismiss' }).click()
  await expect(card).toHaveCount(0)
  await expect(suggested).toHaveCount(1)
  await expect(cmp.locator(`[data-annotation="${secondId}"]`)).toBeFocused()

  await page.keyboard.press('Enter')
  await card.getByRole('button', { name: 'Dismiss' }).click()
  await expect(suggested).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
})

test('after deleting the only note, focus moves to the document', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await page.locator('[data-ink-root]').evaluate(
    (el) =>
      (el as RootEl).__inkDocument!.annotations.add({
        type: 'note',
        page: 0,
        rect: { x: 72, y: 600, width: 24, height: 24 },
        contents: 'Check this',
      }).id
  )
  const note = cmp.locator(`[data-annotation="${id}"]`)
  await note.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-note-popover]')
  await popover.getByRole('button', { name: 'Delete' }).click()
  await expect(popover).toHaveCount(0)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
})
