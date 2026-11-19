import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/RedactionHarness.vue'

import type { Page } from '@playwright/test'
import type {} from '../../playwright/harness/held-engine'

const assets = browserAssets()
guardConsole(test)

type Hooked = HTMLElement & {
  __inkDocument?: {
    annotations: {
      add(input: unknown): { id: string }
      remove(id: string): boolean
    }
  }
}

/** Adds a redaction mark over SECRET-ALPHA on page 1 of the open document; returns its id. */
const mark = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    return root.__inkDocument!.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 45, y: 190, width: 170, height: 35 },
    }).id
  })

const unmark = (page: Page, id: string) =>
  page.evaluate((markId) => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    root.__inkDocument!.annotations.remove(markId)
  }, id)

const writing = (page: Page) => page.evaluate(() => window.__heldEngine!.writing())

test('is disabled without marks', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  const apply = page.getByRole('button', { name: 'Apply redactions' })
  const probe = cmp.getByTestId('probe')
  await expect(apply).toHaveAttribute('data-ink-apply-redactions', '')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(apply).toBeDisabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'false')

  const id = await mark(page)
  await expect(apply).toBeEnabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'true')
  await unmark(page, id)
  await expect(apply).toBeDisabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'false')
})

test('is disabled without the engine prop', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('redact-text'), assets } })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  // The mark is in the document, and still there is nothing to apply it with.
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Apply redactions' })).toBeDisabled()
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-can-redact', 'false')
})

test('shows busy while applying', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  const apply = cmp.locator('[data-ink-apply-redactions]')
  await expect(apply).toBeEnabled()
  await apply.focus()
  await apply.press('Enter')
  await expect.poll(() => writing(page)).toBe(true)
  await expect(apply).toHaveAttribute('aria-busy', 'true')
  // Disabled for assistive tech, but not natively, so focus stays on it.
  await expect(apply).toHaveAttribute('aria-disabled', 'true')
  await expect(apply).not.toHaveAttribute('disabled')
  await expect(apply).toBeFocused()
  await expect(apply).toHaveText('Applying redactions…')
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-busy', 'true')
  // A second press starts nothing. Forced: Playwright waits for an `aria-disabled` button.
  await apply.click({ force: true })

  // A failed apply leaves the document as it was and says why.
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    'The redactions could not be applied. Nothing was changed.'
  )
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
  await expect(apply).toHaveAttribute('aria-busy', 'false')
  await expect(apply).not.toHaveAttribute('aria-disabled')
  await expect(apply).toHaveText('Apply redactions')
  await expect(apply).toBeEnabled()
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-busy', 'false')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(1)
})

test('renders your own element with asChild', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', own: true },
  })
  const own = cmp.locator('button.host-apply')
  await expect(own).toHaveAttribute('data-ink-apply-redactions', '')
  await expect(own).toHaveText('Apply redactions')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(own).toBeDisabled()
  await expect(own).toHaveAttribute('data-disabled', 'true')
  await mark(page)
  await expect(own).toBeEnabled()
  await expect(own).toHaveAttribute('data-disabled', 'false')
  await own.click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(own).toHaveText('Applying redactions…')
  await expect(own).toHaveAttribute('data-busy', 'true')
  await expect(own).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(own).toHaveAttribute('data-busy', 'false')
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
})

const finish = (page: Page) => page.evaluate(() => window.__heldEngine!.finish())
const docKey = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector('[data-ink-root]') as HTMLElement & {
          __inkDocument?: { key: string }
        }
      ).__inkDocument?.key
  )

test('a function redactionConfirm asks with the preview and decides', async ({
  mount,
  page,
}) => {
  const props = {
    src: fixtureUrl('redact-text'),
    assets,
    engine: 'held' as const,
    confirm: 'no' as const,
  }
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  const apply = cmp.locator('[data-ink-apply-redactions]')
  await apply.click()
  await expect(cmp.getByTestId('previews')).toHaveText('1')
  await expect(apply).toHaveAttribute('aria-busy', 'false')
  expect(await writing(page)).toBe(false)
  await expect(cmp.getByTestId('redacted')).toHaveText('0')

  await cmp.update({ props: { ...props, confirm: 'yes' } })
  await apply.click()
  await expect(cmp.getByTestId('previews')).toHaveText('1 1')
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(cmp.getByTestId('redacted')).toHaveText('1')
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(0)
})

test('a redacted listener that throws goes to the app error handler; the file still reopens', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', throwing: true },
    hooksConfig: { errorHandler: true },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  expect(await page.evaluate(() => window.__vueErrors)).toEqual(['host failed'])
  await expect(cmp.getByTestId('errors')).toHaveText('')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(0)
})

test('the pages take no input until the redacted file has replaced the old one', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute('inert', '')
  // Each time the pages take input again, whether the old document is still the one shown.
  await page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    const before = root.__inkDocument
    const seen: boolean[] = []
    ;(window as { __oldTakesInput?: boolean[] }).__oldTakesInput = seen
    new MutationObserver((records) => {
      for (const r of records)
        if (
          r.target instanceof HTMLElement &&
          r.target.isConnected &&
          r.target.matches('[data-ink-scroll]') &&
          !r.target.hasAttribute('inert')
        )
          seen.push(root.__inkDocument === before)
    }).observe(root, { attributes: true, attributeFilter: ['inert'], subtree: true })
  })
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  expect(
    await page.evaluate(() => (window as { __oldTakesInput?: boolean[] }).__oldTakesInput)
  ).not.toContain(true)
})

test('an empty new note open when an apply starts from code is not written into the file', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const thread = page.locator('[data-ink-thread-popover]')
  await page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    const note = root.__inkDocument!.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 300, y: 600, width: 20, height: 20 },
    })
    window.__inkActivate!(note.id)
  })
  await expect(thread).toBeVisible()
  await mark(page)
  await page.evaluate(() => void window.__inkApply!())
  await expect.poll(() => writing(page)).toBe(true)
  expect(await page.evaluate(() => window.__heldEngine!.written())).toEqual([])
  await expect(thread).toBeHidden()
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
})

test('keeps the tool across the reopen', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await cmp.locator('[data-tool="redact-area"]').click()
  const tooled = cmp.locator('[data-ink-tool]')
  await expect(tooled).toHaveAttribute('data-ink-tool', 'redact-area')
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await expect(tooled).toHaveAttribute('data-ink-tool', 'redact-area')
})

test('unmounting mid-apply hands nothing over and reports nothing', async ({
  mount,
  page,
}) => {
  const props = { src: fixtureUrl('redact-text'), assets, engine: 'held' as const }
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await cmp.update({ props: { ...props, shown: false } })
  await expect(page.locator('[data-ink-root]')).toHaveCount(0)
  await finish(page)
  await page.waitForTimeout(200)
  await expect(cmp.getByTestId('redacted')).toHaveText('0')
  await expect(cmp.getByTestId('errors')).toHaveText('')
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveCount(0)
})

test('a src change mid-apply opens the new source and nothing else', async ({
  mount,
  page,
}) => {
  const props = { src: fixtureUrl('redact-text'), assets, engine: 'held' as const }
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await cmp.update({ props: { ...props, src: fixtureUrl('text-simple') } })
  await expect.poll(() => docKey(page)).toContain('text-simple')
  await finish(page)
  await page.waitForTimeout(200)
  expect(await docKey(page)).toContain('text-simple')
  await expect(cmp.getByTestId('redacted')).toHaveText('0')
  await expect(cmp.getByTestId('errors')).toHaveText('')
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveCount(0)
})

test('a src passed from inside the redacted listener opens in place of the redacted file', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: {
      src: fixtureUrl('redact-text'),
      assets,
      engine: 'held',
      swap: fixtureUrl('text-simple'),
    },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect.poll(() => docKey(page)).toContain('text-simple')
  await page.waitForTimeout(200)
  expect(await docKey(page)).toContain('text-simple')
  await expect(cmp.getByTestId('redacted')).toHaveText('1')
  await expect(cmp.getByTestId('errors')).toHaveText('')
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveCount(0)
})

const addSquare = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    root.__inkDocument!.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 300, y: 400, width: 100, height: 60 },
    })
  })

for (const answer of ['now', 'late'] as const) {
  test(`controlled with history (answered ${answer}): the first edit after the reopen is an undo step`, async ({
    mount,
    page,
  }) => {
    const cmp = await mount(Harness, {
      props: {
        src: fixtureUrl('redact-text'),
        assets,
        engine: 'held',
        controlled: answer,
      },
    })
    await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
    const list = cmp.getByTestId('list')
    const undo = page.getByRole('button', { name: 'Undo' })
    const apply = cmp.locator('[data-ink-apply-redactions]')
    const marks = cmp.locator('.ink-annotation[data-type="redact"]')
    await mark(page)
    await expect(list).toHaveText('redact')
    await expect(undo).toBeEnabled()
    await apply.click()
    await expect.poll(() => writing(page)).toBe(true)
    await finish(page)
    await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
      '1 redaction applied.'
    )
    if (answer === 'late') {
      // The host still holds its old list: the redacted file shows the proposed one instead.
      await page.waitForTimeout(150)
      await expect(list).toHaveText('redact')
      await expect(marks).toHaveCount(0)
      await expect(apply).toBeDisabled()
      await expect(undo).toBeDisabled()
      await page.evaluate(() => window.__releaseAnswer!())
    }
    await expect(list).toHaveText('')
    await page.waitForTimeout(150)
    await expect(undo).toBeDisabled()
    await expect(marks).toHaveCount(0)
    await expect(apply).toBeDisabled()

    // The reader's first edit on the redacted file is a step, and undoing it takes it away.
    await addSquare(page)
    await expect(list).toHaveText('square')
    await expect(undo).toBeEnabled()
    await undo.click()
    await expect(list).toHaveText('')
    await expect(undo).toBeDisabled()
  })
}

test('a controlled host that never answers still sees no marks on the redacted file', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: {
      src: fixtureUrl('redact-text'),
      assets,
      engine: 'held',
      controlled: 'never',
    },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  const apply = cmp.locator('[data-ink-apply-redactions]')
  await apply.click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await page.waitForTimeout(300)
  await expect(cmp.getByTestId('list')).toHaveText('redact')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(0)
  await expect(apply).toBeDisabled()
})

test('an edit made before a late answer is proposed on top of the proposed list', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', controlled: 'late' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await addSquare(page)
  // The mark, the redaction's proposal, then the edit: no mark comes back with it.
  await expect(cmp.getByTestId('proposals')).toHaveText('redact||square')
  await expect(cmp.getByTestId('list')).toHaveText('square')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(0)
})

test('opening the redacted file again uses the kept view and the proposed list once', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', controlled: 'now' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const tooled = cmp.locator('[data-ink-tool]')
  const undo = page.getByRole('button', { name: 'Undo' })
  await cmp.locator('[data-tool="redact-area"]').click()
  await mark(page)
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await expect(tooled).toHaveAttribute('data-ink-tool', 'redact-area')
  await cmp.locator('[data-tool="select-text"]').click()
  await expect(tooled).toHaveAttribute('data-ink-tool', 'select-text')
  await addSquare(page)
  await expect(undo).toBeEnabled()

  // A password attempt opens the same source again, as a new open: from the host's list,
  // with the reader's tool and an empty history.
  await page.locator('[data-ink-form-alert-ok]').click()
  await page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    ;(window as { __before?: unknown }).__before = root.__inkDocument
  })
  await cmp.getByTestId('retry').click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector('[data-ink-root]') as Hooked
        const doc = root.__inkDocument
        return doc !== undefined && doc !== (window as { __before?: unknown }).__before
      })
    )
    .toBe(true)
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(cmp.locator('.ink-annotation[data-type="square"]')).toHaveCount(1)
  await expect(cmp.getByTestId('list')).toHaveText('square')
  await expect(tooled).toHaveAttribute('data-ink-tool', 'select-text')
  await expect(undo).toBeDisabled()
})

test("the slot's disabled follows the host's own disabled", async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: {
      src: fixtureUrl('redact-text'),
      assets,
      engine: 'held',
      own: true,
      disabled: true,
    },
  })
  const own = cmp.locator('button.host-apply')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-can-redact', 'true')
  await expect(own).toBeDisabled()
  await expect(own).toHaveAttribute('data-disabled', 'true')
})

test('Download and Print are disabled while the marks are applied', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const download = cmp.locator('[data-ink-download]')
  const print = cmp.locator('[data-ink-print]')
  await mark(page)
  await expect(download).toBeEnabled()
  await expect(print).toBeEnabled()
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(download).toBeDisabled()
  await expect(print).toBeDisabled()
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
  await expect(download).toBeEnabled()
  await expect(print).toBeEnabled()
})

test('a click listener that prevents the default stops the apply', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', prevent: true },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  const apply = cmp.locator('[data-ink-apply-redactions]')
  await apply.click()
  await page.waitForTimeout(200)
  expect(await writing(page)).toBe(false)
  await expect(apply).toHaveAttribute('aria-busy', 'false')
  await expect(cmp.getByTestId('redacted')).toHaveText('0')
})

test('controlled: a mark added while the apply runs stays in the proposed list', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', controlled: 'now' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const list = cmp.getByTestId('list')
  await mark(page)
  await expect(list).toHaveText('redact')
  await cmp.locator('[data-ink-apply-redactions]').click()
  await expect.poll(() => writing(page)).toBe(true)
  // The pages take no input meanwhile; the host's own code still adds a mark.
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute('inert', '')
  await mark(page)
  await expect(list).toHaveText('redact redact')
  await finish(page)
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    '1 redaction applied.'
  )
  await expect(cmp.getByTestId('proposals')).toHaveText('redact|redact redact|redact')
  await expect(list).toHaveText('redact')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(1)
  await expect(cmp.locator('[data-ink-scroll]')).not.toHaveAttribute('inert')
})

const sessionCount = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector('[data-ink-root]') as HTMLElement & {
          __inkDocument?: { annotations: { list: { get(): unknown[] } } }
        }
      ).__inkDocument!.annotations.list.get().length
  )

test('while the marks are applied, Undo and comment threads change nothing', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const note = await page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    return root.__inkDocument!.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 300, y: 600, width: 20, height: 20 },
      // With text: an empty new note goes when its thread closes.
      contents: 'Kept',
    }).id
  })
  await mark(page)
  const undo = page.getByRole('button', { name: 'Undo' })
  const thread = page.locator('[data-ink-thread-popover]')
  const activate = () => page.evaluate((id) => window.__inkActivate!(id), note)
  await expect(undo).toBeEnabled()
  await activate()
  await expect(thread).toBeVisible()

  const apply = cmp.locator('[data-ink-apply-redactions]')
  await apply.click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(thread).toBeHidden()
  await expect(undo).toBeDisabled()
  const before = await sessionCount(page)
  await apply.focus()
  await page.keyboard.press('Control+z')
  await activate()
  await page.waitForTimeout(100)
  await expect(thread).toBeHidden()
  expect(await sessionCount(page)).toBe(before)

  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
  await page.locator('[data-ink-form-alert-ok]').click()
  await expect(undo).toBeEnabled()
  await activate()
  await expect(thread).toBeVisible()
  await page.keyboard.press('Escape')
  await undo.click()
  await expect.poll(() => sessionCount(page)).toBe(before - 1)
})

test('a disabled control of your own that is not a button does not apply', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: {
      src: fixtureUrl('redact-text'),
      assets,
      engine: 'held',
      own: 'div',
      disabled: true,
    },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-can-redact', 'true')
  const own = cmp.locator('div.host-apply')
  await expect(own).toHaveAttribute('data-disabled', 'true')
  await own.click()
  await page.waitForTimeout(200)
  expect(await writing(page)).toBe(false)
  await expect(cmp.getByTestId('redacted')).toHaveText('0')
})
