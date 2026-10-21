import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { PopoverHarness } from '../../playwright/harness/PopoverHarness'

import type { PopoverHarnessProps } from '../../playwright/harness/PopoverHarness'
import type { Locator, Page } from '@playwright/test'

const assets = browserAssets()
const harness = (props: PopoverHarnessProps) => <PopoverHarness {...props} />
const consoleGuard = guardConsole(test)

type Stored = { id: string; type: string; contents?: string; inReplyTo?: string }
type DocHandle = {
  annotations: {
    add(input: unknown): { id: string }
    list: { get(): Stored[] }
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }

const stored = (root: Locator) =>
  root.evaluate((el) => (el as RootEl).__inkDocument!.annotations.list.get())

type HostWindow = Window & { __inkHostRemove?: (id: string) => void }

const docOf = (page: Page) => page.locator('[data-ink-root]')

/** Adds through the dev hook and returns the new id. */
const addAnnotation = (page: Page, input: Record<string, unknown>) =>
  docOf(page).evaluate(
    (el, i) => (el as RootEl).__inkDocument!.annotations.add(i).id,
    input
  )

/** Annotation elements ignore the pointer; their drawn shape takes the press. */
const hitShape = (annotation: Locator) =>
  annotation.locator('svg rect, svg polygon').first()

test('note popover opens on activation, shows the thread, adds a reply and closes', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('annotated-notes-threaded'), assets })
  )
  const root = page.locator('[data-ink-root]')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(2)
  const rootNote = (await stored(root)).find((a) => a.contents === 'Root note')!
  const anchor = cmp.locator(`[data-annotation="${rootNote.id}"]`)
  await anchor.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
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
  expect(reply).toMatchObject({ type: 'text', inReplyTo: rootNote.id })
  await expect(popover.locator('textarea[aria-label="Reply"]')).toHaveValue('')

  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  await expect(anchor).toBeFocused()
})

test('note popover keeps focus inside, closes on Escape and can reopen', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('annotated-notes-threaded'), assets })
  )
  const root = page.locator('[data-ink-root]')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(2)
  const rootNote = (await stored(root)).find((a) => a.contents === 'Root note')!
  const anchor = cmp.locator(`[data-annotation="${rootNote.id}"]`)
  await anchor.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
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

test('after deleting the only note, focus moves to the document', async ({
  mount,
  page,
}) => {
  const cmp = await mount(harness({ src: fixtureUrl('text-simple'), assets }))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await page.locator('[data-ink-root]').evaluate(
    (el) =>
      (el as RootEl).__inkDocument!.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 72, y: 600, width: 24, height: 24 },
        contents: 'Check this',
      }).id
  )
  const note = cmp.locator(`[data-annotation="${id}"]`)
  await note.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('button', { name: 'Delete' }).click()
  await expect(popover).toHaveCount(0)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
})

test('nested replies have no element; the root opens the whole thread in order', async ({
  mount,
  page,
}) => {
  const cmp = await mount(harness({ src: fixtureUrl('text-simple'), assets }))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const note = (y: number, contents: string, inReplyTo?: string) =>
    addAnnotation(page, {
      type: 'text',
      page: 0,
      rect: { x: 72, y, width: 24, height: 24 },
      contents,
      ...(inReplyTo ? { inReplyTo } : {}),
    })
  const r = await note(600, 'Root')
  const b = await note(560, 'Reply B', r)
  const c = await note(520, 'Reply C to B', b)
  await note(480, 'Reply D', r)
  // Replies show in the thread only: the page draws just the root.
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
  await expect(cmp.locator(`[data-annotation="${c}"]`)).toHaveCount(0)
  await cmp.locator(`[data-annotation="${r}"]`).focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover.locator('[data-ink-thread-item] .ink-thread-text')).toHaveText([
    'Root',
    'Reply B',
    'Reply C to B',
    'Reply D',
  ])
  await popover.locator('textarea[aria-label="Reply"]').fill('Done')
  await popover.getByRole('button', { name: 'Reply' }).click()
  await expect(popover.locator('[data-ink-thread-item]')).toHaveCount(5)
  const reply = (await stored(docOf(page))).find((a) => a.contents === 'Done')
  expect(reply?.inReplyTo).toBe(r)
})

test('when the host removes the activated note, focus moves to the document', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('text-simple'), assets, controlled: true })
  )
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const note = (y: number) =>
    addAnnotation(page, {
      type: 'text',
      page: 0,
      rect: { x: 72, y, width: 24, height: 24 },
      contents: 'Check this',
    })
  const id = await note(600)
  await note(560)
  const notes = cmp.locator('[data-annotation][data-type="text"]')
  await expect(notes).toHaveCount(2)
  await cmp.locator(`[data-annotation="${id}"]`).focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover.getByRole('button', { name: 'Delete' })).toBeVisible()
  await popover.getByRole('button', { name: 'Delete' }).focus()
  await page.evaluate((a) => (window as HostWindow).__inkHostRemove!(a), id)
  await expect(popover).toHaveCount(0)
  await expect(notes).toHaveCount(1)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
})

test('a press on custom slot content dismisses the note popover; it does not activate', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('text-simple'), assets, customAnnotations: true })
  )
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const note = (y: number) =>
    addAnnotation(page, {
      type: 'text',
      page: 0,
      rect: { x: 72, y, width: 24, height: 24 },
      contents: 'Check this',
    })
  const first = await note(600)
  const second = await note(560)
  await cmp.locator(`[data-annotation="${first}"]`).focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  await cmp.locator(`[data-annotation="${second}"]`).getByTestId('pin').click()
  await expect(popover).toHaveCount(0)
})

test('with a slow controlled host, deleting a note still moves focus past the removed element', async ({
  mount,
  page,
}) => {
  const props: PopoverHarnessProps = {
    src: fixtureUrl('text-simple'),
    assets,
    controlled: true,
  }
  const cmp = await mount(harness(props))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const note = (y: number) =>
    addAnnotation(page, {
      type: 'text',
      page: 0,
      rect: { x: 72, y, width: 24, height: 24 },
      contents: 'Check this',
    })
  const first = await note(600)
  const second = await note(560)
  const notes = cmp.locator('[data-annotation][data-type="text"]')
  await expect(notes).toHaveCount(2)
  // From here the host applies each proposal 300ms late, after the close has moved focus.
  await cmp.update(harness({ ...props, applyDelay: 300 }))
  const popover = page.locator('[data-ink-thread-popover]')

  await cmp.locator(`[data-annotation="${first}"]`).focus()
  await page.keyboard.press('Enter')
  await popover.getByRole('button', { name: 'Delete' }).click()
  await expect(popover).toHaveCount(0)
  const next = cmp.locator(`[data-annotation="${second}"]`)
  await expect(next).toBeFocused()
  await expect(notes).toHaveCount(1)
  await expect(next).toBeFocused()

  await page.keyboard.press('Enter')
  await popover.getByRole('button', { name: 'Delete' }).click()
  await expect(popover).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
  await expect(notes).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
  // The store reports the late host, as it should; that is not what this test is about.
  expect(consoleGuard.problems).toHaveLength(2)
  expect(
    consoleGuard.problems.every((m) => m.includes('ControlledMutationIgnored'))
  ).toBe(true)
  consoleGuard.clear()
})

test('a locked note has no Delete, and the slot remove keeps the popover and the note', async ({
  mount,
  page,
}) => {
  for (const customNote of [false, true]) {
    const cmp = await mount(
      harness({ src: fixtureUrl('annotated-notes-threaded'), assets, customNote })
    )
    await expect(cmp.locator('[data-annotation]')).toHaveCount(2)
    const rootNote = (await stored(docOf(page))).find((a) => a.contents === 'Root note')!
    const anchor = cmp.locator(`[data-annotation="${rootNote.id}"]`)
    await expect(anchor).toHaveAttribute('data-locked', '')
    await anchor.focus()
    await page.keyboard.press('Enter')
    const popover = page.locator('[data-ink-thread-popover]')
    await expect(popover).toBeVisible()
    if (!customNote) {
      await expect(popover.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    } else {
      await popover.getByTestId('custom-remove').click()
      await expect(popover).toBeVisible()
      await expect(cmp.locator('[data-annotation]')).toHaveCount(2)
    }
    await cmp.unmount()
  }
})

test('with a slow controlled host, Delete closes the note popover before the host applies', async ({
  mount,
  page,
}) => {
  const props: PopoverHarnessProps = {
    src: fixtureUrl('text-simple'),
    assets,
    controlled: true,
  }
  const cmp = await mount(harness(props))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addAnnotation(page, {
    type: 'text',
    page: 0,
    rect: { x: 72, y: 600, width: 24, height: 24 },
    contents: 'Check this',
  })
  const note = cmp.locator(`[data-annotation="${id}"]`)
  await expect(note).toHaveCount(1)
  // From here the host applies each proposal a second late.
  await cmp.update(harness({ ...props, applyDelay: 1000 }))
  await note.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('button', { name: 'Delete' }).click()
  // Closed while the host still has the note.
  await expect(popover).toHaveCount(0)
  expect(await note.count()).toBe(1)
  await expect(note).toHaveCount(0)
  await expect(popover).toHaveCount(0)
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
  expect(consoleGuard.problems).toHaveLength(1)
  expect(consoleGuard.problems[0]).toContain('ControlledMutationIgnored')
  consoleGuard.clear()
})

test('a new note: the popover writes the note text itself, then replies', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('text-simple'), assets, tool: 'note' })
  )
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  // Keyboard only: Enter on the document places a note on the current page and opens it.
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-ink-thread]')).toHaveCount(0)
  await expect(popover.locator('textarea[aria-label="Reply"]')).toHaveCount(0)
  const comment = popover.getByRole('textbox', { name: 'Comment' })
  await comment.fill('Check the date')
  await popover.getByRole('button', { name: 'Comment' }).click()

  const notes = (await stored(docOf(page))).filter((a) => a.type === 'text')
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ contents: 'Check the date' })
  expect(notes[0]!.inReplyTo).toBeUndefined()
  const items = popover.locator('[data-ink-thread-item]')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Check the date')

  // From now on the form replies.
  await popover.getByRole('textbox', { name: 'Reply' }).fill('Agreed')
  await popover.getByRole('button', { name: 'Reply' }).click()
  await expect(items).toHaveCount(2)
  const after = (await stored(docOf(page))).filter((a) => a.type === 'text')
  expect(after.find((a) => a.contents === 'Agreed')).toMatchObject({
    inReplyTo: notes[0]!.id,
  })
  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  await expect(cmp.locator(`[data-annotation="${notes[0]!.id}"]`)).toBeFocused()
})

test('closing a new note without writing anything removes it', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    harness({ src: fixtureUrl('text-simple'), assets, tool: 'note' })
  )
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(0)
  expect(await stored(docOf(page))).toEqual([])
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()

  // The same through the Close button, for a note added with no text.
  const id = await addAnnotation(page, {
    type: 'text',
    page: 0,
    rect: { x: 72, y: 600, width: 24, height: 24 },
  })
  await cmp.locator(`[data-annotation="${id}"]`).focus()
  await page.keyboard.press('Enter')
  await expect(popover).toBeVisible()
  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  expect(await stored(docOf(page))).toEqual([])
})

test('with a slow controlled host, a comment submitted just before closing keeps the note', async ({
  mount,
  page,
}) => {
  const props: PopoverHarnessProps = {
    src: fixtureUrl('text-simple'),
    assets,
    controlled: true,
  }
  const cmp = await mount(harness(props))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addAnnotation(page, {
    type: 'text',
    page: 0,
    rect: { x: 72, y: 600, width: 24, height: 24 },
  })
  const note = cmp.locator(`[data-annotation="${id}"]`)
  await expect(note).toHaveCount(1)
  // From here the host applies each proposal a second late.
  await cmp.update(harness({ ...props, applyDelay: 1000 }))
  await note.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('textbox', { name: 'Comment' }).fill('Keep me')
  await popover.getByRole('button', { name: 'Comment' }).click()
  // Closed before the host has applied the text: the note is still empty in its list.
  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  await expect
    .poll(async () => (await stored(docOf(page))).find((a) => a.id === id)?.contents)
    .toBe('Keep me')
  await page.waitForTimeout(1200)
  await expect(note).toHaveCount(1)
  expect((await stored(docOf(page))).map((a) => a.id)).toEqual([id])
  expect(
    consoleGuard.problems.every((m) => m.includes('ControlledMutationIgnored'))
  ).toBe(true)
  consoleGuard.clear()
})

test('with a slow controlled host, closing an empty note asks for its removal once', async ({
  mount,
  page,
}) => {
  const props: PopoverHarnessProps = {
    src: fixtureUrl('text-simple'),
    assets,
    controlled: true,
  }
  const cmp = await mount(harness(props))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addAnnotation(page, {
    type: 'text',
    page: 0,
    rect: { x: 72, y: 600, width: 24, height: 24 },
  })
  const note = cmp.locator(`[data-annotation="${id}"]`)
  await expect(note).toHaveCount(1)
  await expect(cmp.getByTestId('proposals')).toHaveText('1')
  // From here the host applies each proposal a second late.
  await cmp.update(harness({ ...props, applyDelay: 1000 }))
  await note.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  // The note stays listed until the host applies; it is asked for once, not on every close.
  await page.waitForTimeout(1200)
  await expect(cmp.getByTestId('proposals')).toHaveText('2')
  await expect(note).toHaveCount(0)
  expect(consoleGuard.problems).toHaveLength(1)
  expect(consoleGuard.problems[0]).toContain('ControlledMutationIgnored')
  consoleGuard.clear()
})

/** A one-line highlight across the top of page 0, added through the dev hook. */
const addHighlight = (page: Page, type = 'highlight') =>
  addAnnotation(page, {
    type,
    page: 0,
    quads: [
      {
        p1: { x: 72, y: 712 },
        p2: { x: 260, y: 712 },
        p3: { x: 72, y: 698 },
        p4: { x: 260, y: 698 },
      },
    ],
  })

test('activating a highlight opens the thread popover rooted at it', async ({
  mount,
  page,
}) => {
  const cmp = await mount(harness({ src: fixtureUrl('text-simple'), assets }))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addHighlight(page)
  const mark = cmp.locator(`[data-annotation="${id}"]`)
  // A click with no drag under select-text selects and activates markup.
  await hitShape(mark).click()
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAccessibleName('Comment thread')
  await expect(popover.locator('[data-ink-thread]')).toHaveCount(0)
  await expect(popover.getByRole('textbox', { name: 'Comment' })).toBeFocused()
  // Delete removes the highlight itself, and says so.
  await expect(popover.getByRole('button', { name: 'Delete highlight' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  // Enter on the focused markup opens it again.
  await mark.focus()
  await page.keyboard.press('Enter')
  await expect(popover).toBeVisible()
})

test('first comment sets the highlight contents; next adds a reply', async ({
  mount,
  page,
}) => {
  const cmp = await mount(harness({ src: fixtureUrl('text-simple'), assets }))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addHighlight(page, 'underline')
  const mark = cmp.locator(`[data-annotation="${id}"]`)
  await mark.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('textbox', { name: 'Comment' }).fill('Why this?')
  await popover.getByRole('button', { name: 'Comment' }).click()
  expect((await stored(docOf(page))).find((a) => a.id === id)).toMatchObject({
    type: 'underline',
    contents: 'Why this?',
  })
  const items = popover.locator('[data-ink-thread-item]')
  await expect(items).toHaveCount(1)
  await popover.getByRole('textbox', { name: 'Reply' }).fill('Because')
  await popover.getByRole('button', { name: 'Reply' }).click()
  await expect(items).toHaveCount(2)
  expect((await stored(docOf(page))).find((a) => a.contents === 'Because')).toMatchObject(
    { type: 'text', inReplyTo: id }
  )
  await expect(mark.locator('.ink-comment-marker')).toHaveCount(1)
  // The reply lives in the thread only: nothing for it on the page.
  await expect(cmp.locator('[data-annotation][data-type="text"]')).toHaveCount(0)
})

test('closing an empty highlight thread keeps the highlight', async ({ mount, page }) => {
  const cmp = await mount(harness({ src: fixtureUrl('text-simple'), assets }))
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await addHighlight(page)
  const mark = cmp.locator(`[data-annotation="${id}"]`)
  await mark.focus()
  await page.keyboard.press('Enter')
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('button', { name: 'Close' }).click()
  await expect(popover).toHaveCount(0)
  await expect(mark).toBeFocused()
  expect((await stored(docOf(page))).map((a) => a.id)).toEqual([id])
  await expect(mark.locator('.ink-comment-marker')).toHaveCount(0)
})
