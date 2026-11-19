import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, count, q } from './dom.js'
import { heldEngine } from './harness/held-engine.js'
import RedactionHarness from './harness/RedactionHarness.svelte'

const assets = browserAssets()
guardConsole()

const src = fixtureUrl('redact-text')

interface HookedDocument {
  key: string
  annotations: {
    add(input: unknown): { id: string }
    remove(id: string): boolean
  }
}
type Hooked = HTMLElement & { __inkDocument?: HookedDocument }

const currentDoc = (): HookedDocument | undefined =>
  document.querySelector<Hooked>('[data-ink-root]')?.__inkDocument

/** Adds a redaction mark over SECRET-ALPHA on page 1 of the open document; returns its id. */
const mark = (): string =>
  currentDoc()!.annotations.add({
    type: 'redact',
    page: 0,
    rect: { x: 45, y: 190, width: 170, height: 35 },
  }).id

const addSquare = (): void => {
  currentDoc()!.annotations.add({
    type: 'square',
    page: 0,
    rect: { x: 300, y: 400, width: 100, height: 60 },
  })
}

const text = (testId: string) => () =>
  document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
const alertText = () =>
  document.querySelector('[data-ink-form-alert-message]')?.textContent ?? null
const APPLY = '[data-ink-apply-redactions]'
const MARKS = '.ink-annotation[data-type="redact"]'
const disabledOf = (selector: string) => () =>
  document.querySelector<HTMLButtonElement>(selector)?.disabled ?? null
const undoDisabled = () =>
  document.querySelector<HTMLButtonElement>('[data-ink-undo]')?.disabled ?? null
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms))

const firstPage = () => q('[data-ink-scroll] .ink-page canvas')

describe('InkApplyRedactions', () => {
  it('is disabled without marks', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    const apply = await q<HTMLButtonElement>(APPLY)
    expect(apply.textContent).toBe('Apply redactions')
    await firstPage()
    await expect.poll(disabledOf(APPLY)).toBe(true)
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('false')

    const id = mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('true')
    currentDoc()!.annotations.remove(id)
    await expect.poll(disabledOf(APPLY)).toBe(true)
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('false')
    expect(held.loads).toBe(0)
  })

  it('is disabled without the engine prop', async () => {
    await render(RedactionHarness, { src, assets })
    await firstPage()
    mark()
    // The mark is in the document, and still there is nothing to apply it with.
    await expect.poll(count(MARKS)).toBe(1)
    await expect.poll(disabledOf(APPLY)).toBe(true)
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('false')
  })

  it('shows busy while applying', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    const apply = document.querySelector<HTMLButtonElement>(APPLY)!
    apply.focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(attr(APPLY, 'aria-busy')).toBe('true')
    // Disabled for assistive tech, but not natively, so focus stays on it.
    expect(apply.getAttribute('aria-disabled')).toBe('true')
    expect(apply.disabled).toBe(false)
    expect(document.activeElement).toBe(apply)
    await expect.poll(() => apply.textContent).toBe('Applying redactions…')
    await expect.poll(attr('[data-testid="probe"]', 'data-busy')).toBe('true')
    // A second press starts nothing.
    apply.click()

    // A failed apply leaves the document as it was and says why.
    held.fail()
    await expect
      .poll(alertText)
      .toBe('The redactions could not be applied. Nothing was changed.')
    await expect.poll(text('errors')).toBe('RedactionFailed')
    await expect.poll(attr(APPLY, 'aria-busy')).toBe('false')
    expect(apply.hasAttribute('aria-disabled')).toBe(false)
    expect(apply.textContent).toBe('Apply redactions')
    expect(apply.disabled).toBe(false)
    await expect.poll(attr('[data-testid="probe"]', 'data-busy')).toBe('false')
    expect(count(MARKS)()).toBe(1)
    expect(held.writing()).toBe(false)
  })

  it('renders your own element with asChild', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader, own: 'child' })
    const own = await q<HTMLButtonElement>('button.host-apply')
    expect(own.hasAttribute('data-ink-apply-redactions')).toBe(true)
    expect(own.textContent).toBe('Mine')
    await firstPage()
    await expect.poll(() => own.disabled).toBe(true)
    mark()
    await expect.poll(() => own.disabled).toBe(false)
    own.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(() => own.getAttribute('aria-busy')).toBe('true')
    held.fail()
    await expect.poll(() => own.getAttribute('aria-busy')).toBe('false')
    await expect.poll(text('errors')).toBe('RedactionFailed')
  })

  it('a disabled control of your own that is not a button does not apply', async () => {
    const held = heldEngine()
    await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      own: 'div',
      disabled: true,
    })
    const own = await q<HTMLElement>('div.host-apply')
    await firstPage()
    mark()
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('true')
    own.click()
    await settle(200)
    expect(held.writing()).toBe(false)
    expect(text('redacted')()).toBe('0')
  })

  it('Download and Print are disabled while the marks are applied', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    expect(disabledOf('[data-ink-download]')()).toBe(false)
    expect(disabledOf('[data-ink-print]')()).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(disabledOf('[data-ink-download]')).toBe(true)
    await expect.poll(disabledOf('[data-ink-print]')).toBe(true)
    held.fail()
    await expect.poll(text('errors')).toBe('RedactionFailed')
    await expect.poll(disabledOf('[data-ink-download]')).toBe(false)
    await expect.poll(disabledOf('[data-ink-print]')).toBe(false)
  })

  it('while the marks are applied, Undo and comment threads change nothing', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    const note = currentDoc()!.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 300, y: 600, width: 20, height: 20 },
      // With text: an empty new note goes when its thread closes.
      contents: 'Kept',
    }).id
    mark()
    const sessionCount = () =>
      (
        currentDoc() as unknown as { annotations: { list: { get(): unknown[] } } }
      ).annotations.list.get().length
    const activate = () =>
      (window as { __inkActivate?: (id: string | null) => void }).__inkActivate!(note)
    const threadOpen = () => document.querySelector('[data-ink-thread-popover]') !== null
    const UNDO = '[data-ink-undo]'
    await expect.poll(disabledOf(UNDO)).toBe(false)
    activate()
    await expect.poll(threadOpen).toBe(true)

    const apply = document.querySelector<HTMLButtonElement>(APPLY)!
    apply.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(threadOpen).toBe(false)
    await expect.poll(disabledOf(UNDO)).toBe(true)
    const before = sessionCount()
    apply.focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    activate()
    await settle(100)
    expect(threadOpen()).toBe(false)
    expect(sessionCount()).toBe(before)

    held.fail()
    await expect.poll(text('errors')).toBe('RedactionFailed')
    await expect.poll(disabledOf(UNDO)).toBe(false)
    activate()
    await expect.poll(threadOpen).toBe(true)
    await userEvent.keyboard('{Escape}')
    document.querySelector<HTMLButtonElement>(UNDO)!.click()
    await expect.poll(sessionCount).toBe(before - 1)
  })

  it("the snippet gets the label, busy and disabled, and disabled follows the host's own", async () => {
    const held = heldEngine()
    const screen = await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      own: 'children',
    })
    const label = await q('.host-label')
    expect(label.textContent).toBe('Apply redactions')
    await firstPage()
    await expect.poll(() => label.getAttribute('data-disabled')).toBe('true')
    mark()
    await expect.poll(() => label.getAttribute('data-disabled')).toBe('false')
    await expect.poll(disabledOf(APPLY)).toBe(false)

    await screen.rerender({ disabled: true })
    await expect.poll(() => label.getAttribute('data-disabled')).toBe('true')
    await expect.poll(disabledOf(APPLY)).toBe(true)
    expect(
      document.querySelector('[data-testid="probe"]')!.getAttribute('data-can-redact')
    ).toBe('true')

    await screen.rerender({ disabled: false })
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(() => label.getAttribute('data-busy')).toBe('true')
    await expect.poll(() => label.textContent).toBe('Applying redactions…')
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
  })

  it('a function redactionConfirm asks with the preview and decides', async () => {
    const held = heldEngine()
    const screen = await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      confirm: 'no',
    })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(text('previews')).toBe('1')
    await expect.poll(attr(APPLY, 'aria-busy')).toBe('false')
    expect(held.writing()).toBe(false)
    expect(text('redacted')()).toBe('0')

    await screen.rerender({ confirm: 'yes' })
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(text('previews')).toBe('1 1')
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(text('redacted')).toBe('1')
    await expect.poll(alertText).toBe('1 redaction applied.')
    await expect.poll(count(MARKS)).toBe(0)
    await expect.poll(disabledOf(APPLY)).toBe(true)
  })

  it('the built-in dialog asks, and Apply reopens on the redacted file under the same key', async () => {
    const held = heldEngine()
    await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      confirm: 'dialog',
    })
    await firstPage()
    const key = currentDoc()!.key
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    // Cancel answers no: nothing is applied.
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    const dialog = await q('[data-ink-redaction-dialog]')
    await expect
      .poll(() => dialog.textContent)
      .toContain('This removes the content under 1 mark on 1 page.')
    await browserPage.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => dialog.isConnected && !dialog.hidden).toBe(false)
    expect(held.writing()).toBe(false)

    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await browserPage.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    expect(text('redacted')()).toBe('1')
    await expect.poll(count(MARKS)).toBe(0)
    // The same key: the redacted bytes stand in for the source.
    expect(currentDoc()!.key).toBe(key)
    expect(text('errors')()).toBe('')
  })

  it('an onRedacted that throws reaches onError, and the file still reopens', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader, throwing: true })
    await firstPage()
    const before = currentDoc()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    expect(text('errors')()).toBe('RedactionFailed:onRedacted')
    expect(currentDoc()).not.toBe(before)
    await expect.poll(count(MARKS)).toBe(0)
  })

  it('the pages take no input until the redacted file has replaced the old one', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect
      .poll(() => document.querySelector('[data-ink-scroll]')?.hasAttribute('inert'))
      .toBe(true)
    // Each time the pages take input again, whether the old document is still the one shown.
    const root = document.querySelector<Hooked>('[data-ink-root]')!
    const before = root.__inkDocument
    const seen: boolean[] = []
    const observer = new MutationObserver((records) => {
      for (const r of records)
        if (
          r.target instanceof HTMLElement &&
          r.target.isConnected &&
          r.target.matches('[data-ink-scroll]') &&
          !r.target.hasAttribute('inert')
        )
          seen.push(root.__inkDocument === before)
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['inert'],
      subtree: true,
    })
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    observer.disconnect()
    expect(seen).not.toContain(true)
  })

  it('keeps the tool across the reopen', async () => {
    const held = heldEngine()
    await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    document.querySelector<HTMLButtonElement>('[data-tool="redact-area"]')!.click()
    await expect.poll(attr('[data-ink-tool]', 'data-ink-tool')).toBe('redact-area')
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    expect(attr('[data-ink-tool]', 'data-ink-tool')()).toBe('redact-area')
  })

  it('useRedaction().apply resolves with what was done, and with null when cancelled', async () => {
    const held = heldEngine()
    const screen = await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      confirm: 'no',
    })
    await firstPage()
    mark()
    await expect.poll(attr('[data-testid="probe"]', 'data-can-redact')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-testid="hook-apply"]')!.click()
    await expect.poll(attr('[data-testid="probe"]', 'data-applied')).toBe('null')

    await screen.rerender({ confirm: 'yes' })
    document.querySelector<HTMLButtonElement>('[data-testid="hook-apply"]')!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await expect.poll(attr('[data-testid="probe"]', 'data-busy')).toBe('true')
    held.finish()
    await expect.poll(attr('[data-testid="probe"]', 'data-applied')).toBe('1')
    await expect.poll(alertText).toBe('1 redaction applied.')
  })

  it('unmounting mid-apply hands nothing over and reports nothing', async () => {
    const held = heldEngine()
    const screen = await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await screen.rerender({ shown: false })
    await expect.poll(count('[data-ink-root]')).toBe(0)
    held.finish()
    await settle(200)
    expect(text('redacted')()).toBe('0')
    expect(text('errors')()).toBe('')
    expect(alertText()).toBeNull()
  })

  it('a src change mid-apply opens the new source and nothing else', async () => {
    const held = heldEngine()
    const screen = await render(RedactionHarness, { src, assets, engine: held.loader })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    await screen.rerender({ src: fixtureUrl('text-simple') })
    await expect.poll(() => currentDoc()?.key).toContain('text-simple')
    held.finish()
    await settle(200)
    expect(currentDoc()?.key).toContain('text-simple')
    expect(text('redacted')()).toBe('0')
    expect(text('errors')()).toBe('')
    expect(alertText()).toBeNull()
  })

  it('a src passed from inside onRedacted opens in place of the redacted file', async () => {
    const held = heldEngine()
    await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      swap: fixtureUrl('text-simple'),
    })
    await firstPage()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(() => currentDoc()?.key).toContain('text-simple')
    await settle(200)
    expect(currentDoc()?.key).toContain('text-simple')
    expect(text('redacted')()).toBe('1')
    expect(text('errors')()).toBe('')
    expect(alertText()).toBeNull()
  })
})

describe('InkApplyRedactions with controlled annotations and history', () => {
  /** Opens a controlled harness, marks SECRET-ALPHA, applies and lets the apply finish. */
  async function applyControlled(
    controlled: 'bound' | 'late' | 'never' | 'change',
    before?: () => void
  ) {
    const held = heldEngine()
    const control: { release?: () => void } = {}
    await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      controlled,
      control,
    })
    await firstPage()
    before?.()
    mark()
    await expect.poll(text('list')).toMatch(/redact$/)
    await expect.poll(undoDisabled).toBe(false)
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    return { held, control }
  }

  /** The reader's first edit on the redacted file is a step, and undoing it takes it away. */
  async function firstEditIsAStep(): Promise<void> {
    addSquare()
    await expect.poll(text('list')).toBe('square')
    await expect.poll(undoDisabled).toBe(false)
    document.querySelector<HTMLButtonElement>('[data-ink-undo]')!.click()
    await expect.poll(text('list')).toBe('')
    await expect.poll(undoDisabled).toBe(true)
  }

  it('bind:annotations: the answer is no step, and the first edit after the reopen is one', async () => {
    await applyControlled('bound')
    await expect.poll(text('list')).toBe('')
    await settle(150)
    expect(undoDisabled()).toBe(true)
    expect(count(MARKS)()).toBe(0)
    expect(disabledOf(APPLY)()).toBe(true)
    await firstEditIsAStep()
  })

  it('a function binding that answers late: the redacted file shows the proposed list until then', async () => {
    const { control } = await applyControlled('late')
    // The host still holds its old list: the redacted file shows the proposed one instead.
    await settle(150)
    expect(text('list')()).toBe('redact')
    expect(count(MARKS)()).toBe(0)
    expect(disabledOf(APPLY)()).toBe(true)
    expect(undoDisabled()).toBe(true)
    control.release!()
    await expect.poll(text('list')).toBe('')
    await settle(150)
    expect(undoDisabled()).toBe(true)
    expect(count(MARKS)()).toBe(0)
    await firstEditIsAStep()
  })

  it('a function binding that never answers still sees no marks on the redacted file', async () => {
    await applyControlled('never')
    await settle(300)
    expect(text('list')()).toBe('redact')
    expect(count(MARKS)()).toBe(0)
    expect(disabledOf(APPLY)()).toBe(true)
  })

  it('a function binding that changes the proposal: the redacted file shows its answer', async () => {
    await applyControlled('change', addSquare)
    // Proposed: the square without the mark; the host answered with no annotations at all.
    await expect.poll(text('proposals')).toMatch(/\|square$/)
    expect(text('list')()).toBe('')
    await expect.poll(count('.ink-annotation[data-type="square"]')).toBe(0)
    expect(count(MARKS)()).toBe(0)
    await settle(150)
    expect(undoDisabled()).toBe(true)
    await firstEditIsAStep()
  })

  it('an edit made before a late answer is proposed on top of the proposed list', async () => {
    await applyControlled('late')
    addSquare()
    // The mark, the redaction's proposal, then the edit: no mark comes back with it.
    await expect.poll(text('proposals')).toBe('redact||square')
    await expect.poll(text('list')).toBe('square')
    expect(count(MARKS)()).toBe(0)
  })

  it('opening the redacted file again uses the kept view and the proposed list once', async () => {
    const held = heldEngine()
    await render(RedactionHarness, {
      src,
      assets,
      engine: held.loader,
      controlled: 'bound',
    })
    await firstPage()
    document.querySelector<HTMLButtonElement>('[data-tool="redact-area"]')!.click()
    mark()
    await expect.poll(disabledOf(APPLY)).toBe(false)
    document.querySelector<HTMLButtonElement>(APPLY)!.click()
    await expect.poll(() => held.writing()).toBe(true)
    held.finish()
    await expect.poll(alertText).toBe('1 redaction applied.')
    expect(attr('[data-ink-tool]', 'data-ink-tool')()).toBe('redact-area')
    document.querySelector<HTMLButtonElement>('[data-tool="select-text"]')!.click()
    await expect.poll(attr('[data-ink-tool]', 'data-ink-tool')).toBe('select-text')
    addSquare()
    await expect.poll(undoDisabled).toBe(false)

    // A password attempt opens the same source again, as a new open: from the host's list,
    // with the reader's tool and an empty history.
    const before = currentDoc()
    document.querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click()
    await expect
      .poll(() => currentDoc() !== undefined && currentDoc() !== before)
      .toBe(true)
    await firstPage()
    await expect.poll(count('.ink-annotation[data-type="square"]')).toBe(1)
    expect(text('list')()).toBe('square')
    expect(attr('[data-ink-tool]', 'data-ink-tool')()).toBe('select-text')
    await expect.poll(undoDisabled).toBe(true)
    expect(alertText()).toBeNull()
  })
})
