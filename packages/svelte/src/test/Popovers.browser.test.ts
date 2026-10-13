import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, count, focused, q, qa, sleep } from './dom.js'
import PopoverHarness, {
  type HostWindow,
  type PopoverHarnessProps,
} from './harness/PopoverHarness.svelte'

const assets = browserAssets()
const consoleGuard = guardConsole()

type Stored = { id: string; type: string; contents?: string; inReplyTo?: string }
type DocHandle = {
  annotations: {
    add(input: unknown): { id: string }
    update(id: string, patch: unknown): unknown
    select(ids: string[]): void
    list: { get(): Stored[] }
    selection: { get(): string[] }
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }

const doc = () => document.querySelector<RootEl>('[data-ink-root]')!.__inkDocument!
const stored = () => doc().annotations.list.get()
/** Adds through the dev hook and returns the new id. */
const addAnnotation = (input: Record<string, unknown>) => doc().annotations.add(input).id
const FIRST = '.ink-page[data-page="0"]'
const SCROLL = '[data-ink-scroll]'
const POPOVER = '[data-ink-note-popover]'
const CARD = '[data-ink-suggestion-card]'
const SUGGESTED = '[data-annotation][data-origin="suggested"]'
const scroll = () => document.querySelector<HTMLElement>(SCROLL)!
const byRole = (root: Element, role: string, name: string) =>
  browserPage.elementLocator(root).getByRole(role, { name, exact: true })
const activate = async (el: HTMLElement) => {
  el.focus()
  await userEvent.keyboard('{Enter}')
}
/** Annotation elements ignore the pointer; their drawn shape takes the press. */
const hitShape = (annotation: Element) =>
  browserPage.elementLocator(annotation.querySelector('svg rect, svg polygon')!)
const harness = (props: PopoverHarnessProps) => render(PopoverHarness, props)

describe('popovers', () => {
  // React: 'note popover opens on activation, shows the thread, adds a reply and closes'
  it('note popover opens on activation, shows the thread, adds a reply and closes', async () => {
    await harness({ src: fixtureUrl('annotated-notes-threaded'), assets })
    await expect.poll(count('[data-annotation]')).toBe(4)
    const rootNote = stored().find((a) => a.contents === 'Root note')!
    const anchor = await q(`[data-annotation="${rootNote.id}"]`)
    await activate(anchor)
    const popover = await q(POPOVER)
    await expect.element(browserPage.elementLocator(popover)).toBeVisible()
    expect(popover.getAttribute('role')).toBe('dialog')
    await expect
      .element(browserPage.elementLocator(popover))
      .toHaveAccessibleName('Note thread')
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(3)
    expect(qa(`${POPOVER} [data-ink-thread-item]`)[0]!.textContent).toContain('Root note')
    // Embedded notes are locked: no Delete.
    expect(byRole(popover, 'button', 'Delete').elements()).toHaveLength(0)

    const textarea = browserPage.elementLocator(
      await q(`${POPOVER} textarea[aria-label="Reply"]`)
    )
    await textarea.fill('Looks fine')
    await byRole(popover, 'button', 'Reply').click()
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(4)
    expect(qa(`${POPOVER} [data-ink-thread-item]`).at(-1)!.textContent).toContain(
      'Looks fine'
    )
    const reply = stored().find((a) => a.contents === 'Looks fine')
    expect(reply).toMatchObject({ type: 'note', inReplyTo: rootNote.id })
    await expect.element(textarea).toHaveValue('')

    await byRole(popover, 'button', 'Close').click()
    await expect.poll(count(POPOVER)).toBe(0)
    await expect.poll(focused).toBe(anchor)
  })

  // React: 'note popover keeps focus inside, closes on Escape and can reopen'
  it('note popover keeps focus inside, closes on Escape and can reopen', async () => {
    await harness({ src: fixtureUrl('annotated-notes-threaded'), assets })
    await expect.poll(count('[data-annotation]')).toBe(4)
    const rootNote = stored().find((a) => a.contents === 'Root note')!
    const anchor = await q(`[data-annotation="${rootNote.id}"]`)
    await activate(anchor)
    const popover = await q(POPOVER)
    const textarea = await q<HTMLTextAreaElement>(
      `${POPOVER} textarea[aria-label="Reply"]`
    )
    textarea.focus()
    await browserPage.elementLocator(textarea).fill('x')
    // Tab cycles inside the popover: textarea, Reply, Close, then back round.
    await userEvent.tab()
    await expect.poll(focused).toBe(byRole(popover, 'button', 'Reply').element())
    await userEvent.tab()
    await expect.poll(focused).toBe(byRole(popover, 'button', 'Close').element())
    await userEvent.tab()
    await expect.poll(focused).toBe(textarea)

    await userEvent.keyboard('{Escape}')
    await expect.poll(count(POPOVER)).toBe(0)
    await expect.poll(focused).toBe(anchor)
    // Escape cleared the activated annotation, so activating it again reopens the popover.
    await userEvent.keyboard('{Enter}')
    await q(POPOVER)
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(3)
  })

  // React: 'suggestion card accepts into a user redaction and dismisses'
  it('suggestion card accepts into a user redaction and dismisses', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, seedSuggestions: true })
    await expect.poll(count(SUGGESTED)).toBe(2)
    await hitShape(qa(SUGGESTED)[0]!).click()
    const card = await q(CARD)
    await expect.element(browserPage.elementLocator(card)).toBeVisible()
    await expect
      .element(browserPage.elementLocator(card))
      .toHaveAccessibleName('Suggested redaction')
    expect(card.textContent).toContain('third-party name')
    expect(card.textContent).toContain('Names a person other than the data subject.')
    expect(attr(`${CARD} [data-confidence]`, 'data-confidence')()).toBe('high')
    await byRole(card, 'button', 'Accept').click()
    await expect
      .poll(count('[data-annotation][data-origin="user"][data-type="redact"]'))
      .toBe(1)
    await expect.poll(count(CARD)).toBe(0)

    await hitShape(qa(SUGGESTED)[0]!).click()
    await expect.poll(attr(`${CARD} [data-confidence]`, 'data-confidence')).toBe('low')
    await byRole(await q(CARD), 'button', 'Dismiss').click()
    await expect.poll(count(SUGGESTED)).toBe(0)
    await expect.poll(count(CARD)).toBe(0)
    await expect.poll(count('[data-annotation]')).toBe(1)
    // No suggestion follows it: focus goes to the previous annotation, the accepted one.
    await expect
      .poll(focused)
      .toBe(document.querySelector('[data-annotation][data-origin="user"]'))
  })

  // React: 'suggestion card opens from the keyboard and Escape closes it and clears the selection'
  it('suggestion card opens from the keyboard and Escape closes it and clears the selection', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, seedSuggestions: true })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const first = qa(SUGGESTED)[0]!
    await activate(first)
    const card = await q(CARD)
    await expect.element(browserPage.elementLocator(card)).toBeVisible()
    await expect.poll(focused).toBe(byRole(card, 'button', 'Accept').element())
    await userEvent.keyboard('{Escape}')
    await expect.poll(count(CARD)).toBe(0)
    await expect.poll(focused).toBe(first)
    await expect.poll(() => first.getAttribute('data-state')).toBe('idle')
    expect(doc().annotations.selection.get()).toEqual([])
  })

  // React: 'after a dismiss, focus moves to the next suggestion, then to the document'
  it('after a dismiss, focus moves to the next suggestion, then to the document', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, seedSuggestions: true })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const secondId = qa(SUGGESTED)[1]!.getAttribute('data-annotation')
    await activate(qa(SUGGESTED)[0]!)
    await byRole(await q(CARD), 'button', 'Dismiss').click()
    await expect.poll(count(CARD)).toBe(0)
    await expect.poll(count(SUGGESTED)).toBe(1)
    await expect
      .poll(focused)
      .toBe(document.querySelector(`[data-annotation="${secondId}"]`))

    await userEvent.keyboard('{Enter}')
    await byRole(await q(CARD), 'button', 'Dismiss').click()
    await expect.poll(count(SUGGESTED)).toBe(0)
    await expect.poll(focused).toBe(scroll())
  })

  // React: 'after deleting the only note, focus moves to the document'
  it('after deleting the only note, focus moves to the document', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const id = addAnnotation({
      type: 'note',
      page: 0,
      rect: { x: 72, y: 600, width: 24, height: 24 },
      contents: 'Check this',
    })
    await activate(await q(`[data-annotation="${id}"]`))
    await byRole(await q(POPOVER), 'button', 'Delete').click()
    await expect.poll(count(POPOVER)).toBe(0)
    await expect.poll(count('[data-annotation]')).toBe(0)
    await expect.poll(focused).toBe(scroll())
  })

  // React: 'a locked suggestion has no Dismiss, and the slot dismiss keeps the card open'
  it('a locked suggestion has no Dismiss, and the snippet dismiss keeps the card open', async () => {
    for (const customCard of [false, true]) {
      const screen = await harness({
        src: fixtureUrl('text-simple'),
        assets,
        seedSuggestions: true,
        customCard,
      })
      await expect.poll(count(SUGGESTED)).toBe(2)
      const id = qa(SUGGESTED)[0]!.getAttribute('data-annotation')!
      doc().annotations.update(id, { locked: true })
      await expect.poll(attr(`[data-annotation="${id}"]`, 'data-locked')).toBe('')
      await activate(await q(`[data-annotation="${id}"]`))
      const card = await q(CARD)
      await expect.element(browserPage.elementLocator(card)).toBeVisible()
      if (!customCard) {
        expect(byRole(card, 'button', 'Dismiss').elements()).toHaveLength(0)
        expect(byRole(card, 'button', 'Accept').elements()).toHaveLength(1)
      } else {
        await screen.getByTestId('custom-dismiss').click()
        await expect.element(browserPage.elementLocator(card)).toBeVisible()
        expect(count(SUGGESTED)()).toBe(2)
      }
      await screen.unmount()
    }
  })

  // React: 'activating a nested reply opens the whole thread from its root'
  it('activating a nested reply opens the whole thread from its root', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const note = (y: number, contents: string, inReplyTo?: string) =>
      addAnnotation({
        type: 'note',
        page: 0,
        rect: { x: 72, y, width: 24, height: 24 },
        contents,
        ...(inReplyTo ? { inReplyTo } : {}),
      })
    const r = note(600, 'Root')
    const b = note(560, 'Reply B', r)
    const c = note(520, 'Reply C to B', b)
    note(480, 'Reply D', r)
    await activate(await q(`[data-annotation="${c}"]`))
    const popover = await q(POPOVER)
    await expect
      .poll(() =>
        qa(`${POPOVER} [data-ink-thread-item] .ink-thread-text`).map((e) => e.textContent)
      )
      .toEqual(['Root', 'Reply B', 'Reply C to B', 'Reply D'])
    await browserPage
      .elementLocator(await q(`${POPOVER} textarea[aria-label="Reply"]`))
      .fill('Done')
    await byRole(popover, 'button', 'Reply').click()
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(5)
    const reply = stored().find((a) => a.contents === 'Done')
    expect(reply?.inReplyTo).toBe(r)
  })

  // React: 'when the host removes the activated suggestion, focus moves to the document'
  it('when the host removes the activated suggestion, focus moves to the document', async () => {
    await harness({
      src: fixtureUrl('text-simple'),
      assets,
      seedSuggestions: true,
      controlled: true,
    })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const id = qa(SUGGESTED)[0]!.getAttribute('data-annotation')!
    await activate(qa(SUGGESTED)[0]!)
    const card = await q(CARD)
    await expect.poll(focused).toBe(byRole(card, 'button', 'Accept').element())
    ;(window as HostWindow).__inkHostRemove!(id)
    await expect.poll(count(CARD)).toBe(0)
    await expect.poll(count(SUGGESTED)).toBe(1)
    await expect.poll(focused).toBe(scroll())
  })

  // React: 'a sole selected suggestion opens the card when something else is activated'
  it('a sole selected suggestion opens the card when something else is activated', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, seedSuggestions: true })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const mark = addAnnotation({
      type: 'redact',
      page: 0,
      rect: { x: 300, y: 500, width: 100, height: 20 },
    })
    await activate(await q(`[data-annotation="${mark}"]`))
    await sleep(100)
    expect(count(CARD)()).toBe(0)
    // A marquee selects without activating.
    const id = qa(SUGGESTED)[0]!.getAttribute('data-annotation')!
    doc().annotations.select([id])
    const card = await q(CARD)
    await expect.element(browserPage.elementLocator(card)).toBeVisible()
    expect(card.textContent).toContain('third-party name')
  })

  // No React counterpart: the popover library reports a close while it opens, and the focus
  // planner must not answer that one by focusing the annotation.
  it('a card opened by selection alone takes focus without passing it through the annotation', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, seedSuggestions: true })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const anchor = qa(SUGGESTED)[0]!
    const id = anchor.getAttribute('data-annotation')!
    // Focus is outside the root, and nothing has been activated.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    expect(focused()).toBe(document.body)

    const seen: EventTarget[] = []
    const record = (e: FocusEvent): void => {
      if (e.target) seen.push(e.target)
    }
    document.addEventListener('focusin', record, true)
    try {
      doc().annotations.select([id])
      const card = await q(CARD)
      await expect.poll(focused).toBe(byRole(card, 'button', 'Accept').element())
    } finally {
      document.removeEventListener('focusin', record, true)
    }
    expect(seen).not.toContain(anchor)
    expect(
      seen.filter((t) => t instanceof Element && t.closest('[data-annotation]'))
    ).toEqual([])
    expect(seen.at(-1)).toBe(focused())
  })

  // React: 'a press on custom slot content dismisses the card; it does not activate'
  it('a press on snippet content dismisses the card; it does not activate', async () => {
    await harness({
      src: fixtureUrl('text-simple'),
      assets,
      seedSuggestions: true,
      customAnnotations: true,
    })
    await expect.poll(count(SUGGESTED)).toBe(2)
    // The card opens just below the first suggestion and covers the second, so the press goes
    // to a third suggestion clear of it. Were the press to activate it, the card would stay
    // open on that one.
    const third = addAnnotation({
      type: 'redact',
      page: 0,
      rect: { x: 300, y: 400, width: 150, height: 20 },
      origin: 'suggested',
      suggestion: { confidence: 0.5, reason: 'possible name' },
    })
    await expect.poll(count(SUGGESTED)).toBe(3)
    await activate(qa(SUGGESTED)[0]!)
    const card = await q(CARD)
    expect(card.textContent).toContain('third-party name')
    await browserPage
      .elementLocator(await q(`[data-annotation="${third}"] [data-testid="pin"]`))
      .click()
    await expect.poll(count(CARD)).toBe(0)
    expect(doc().annotations.selection.get()).toEqual([])
  })

  // React: 'with a slow controlled host, a dismiss still moves focus past the removed element'
  it('with a slow controlled host, a dismiss still moves focus past the removed element', async () => {
    const screen = await harness({
      src: fixtureUrl('text-simple'),
      assets,
      seedSuggestions: true,
      controlled: true,
    })
    await expect.poll(count(SUGGESTED)).toBe(2)
    const second = qa(SUGGESTED)[1]!.getAttribute('data-annotation')!
    // From here the host applies each proposal 300ms late, after the close has moved focus.
    await screen.rerender({ applyDelay: 300 })

    await activate(qa(SUGGESTED)[0]!)
    await byRole(await q(CARD), 'button', 'Dismiss').click()
    await expect.poll(count(CARD)).toBe(0)
    const next = document.querySelector<HTMLElement>(`[data-annotation="${second}"]`)!
    await expect.poll(focused).toBe(next)
    await expect.poll(count(SUGGESTED)).toBe(1)
    expect(focused()).toBe(next)

    await userEvent.keyboard('{Enter}')
    await byRole(await q(CARD), 'button', 'Dismiss').click()
    await expect.poll(count(CARD)).toBe(0)
    await expect.poll(focused).toBe(scroll())
    await expect.poll(count(SUGGESTED)).toBe(0)
    expect(focused()).toBe(scroll())
    // The store reports the late host, as it should; that is not what this test is about.
    await expect.poll(() => consoleGuard.problems.length).toBe(2)
    expect(
      consoleGuard.problems.every((m) => m.includes('ControlledMutationIgnored'))
    ).toBe(true)
    consoleGuard.clear()
  })

  // React: 'a locked note has no Delete, and the slot remove keeps the popover and the note'
  it('a locked note has no Delete, and the snippet remove keeps the popover and the note', async () => {
    for (const customNote of [false, true]) {
      const screen = await harness({
        src: fixtureUrl('annotated-notes-threaded'),
        assets,
        customNote,
      })
      await expect.poll(count('[data-annotation]')).toBe(4)
      const rootNote = stored().find((a) => a.contents === 'Root note')!
      const anchor = await q(`[data-annotation="${rootNote.id}"]`)
      expect(anchor.getAttribute('data-locked')).toBe('')
      await activate(anchor)
      const popover = await q(POPOVER)
      await expect.element(browserPage.elementLocator(popover)).toBeVisible()
      if (!customNote) {
        expect(byRole(popover, 'button', 'Delete').elements()).toHaveLength(0)
      } else {
        await screen.getByTestId('custom-remove').click()
        await expect.element(browserPage.elementLocator(popover)).toBeVisible()
        expect(count('[data-annotation]')()).toBe(4)
      }
      await screen.unmount()
    }
  })

  // React: 'with a slow controlled host, Delete closes the note popover before the host applies'
  it('with a slow controlled host, Delete closes the note popover before the host applies', async () => {
    const screen = await harness({
      src: fixtureUrl('text-simple'),
      assets,
      controlled: true,
    })
    await q(`${FIRST} canvas`)
    const id = addAnnotation({
      type: 'note',
      page: 0,
      rect: { x: 72, y: 600, width: 24, height: 24 },
      contents: 'Check this',
    })
    const sel = `[data-annotation="${id}"]`
    await q(sel)
    // From here the host applies each proposal a second late.
    await screen.rerender({ applyDelay: 1000 })
    await activate(await q(sel))
    await byRole(await q(POPOVER), 'button', 'Delete').click()
    // Closed while the host still has the note.
    await expect.poll(count(POPOVER)).toBe(0)
    expect(count(sel)()).toBe(1)
    await expect.poll(count(sel)).toBe(0)
    expect(count(POPOVER)()).toBe(0)
    await expect.poll(focused).toBe(scroll())
    await expect.poll(() => consoleGuard.problems.length).toBe(1)
    expect(consoleGuard.problems[0]).toContain('ControlledMutationIgnored')
    consoleGuard.clear()
  })

  // React: 'a new note: the popover writes the note text itself, then replies'
  it('a new note: the popover writes the note text itself, then replies', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, tool: 'note' })
    await q(`${FIRST} canvas`)
    // Keyboard only: Enter on the document places a note on the current page and opens it.
    scroll().focus()
    await userEvent.keyboard('{Enter}')
    const popover = await q(POPOVER)
    await expect.element(browserPage.elementLocator(popover)).toBeVisible()
    expect(count(`${POPOVER} [data-ink-thread]`)()).toBe(0)
    expect(count(`${POPOVER} textarea[aria-label="Reply"]`)()).toBe(0)
    await byRole(popover, 'textbox', 'Comment').fill('Check the date')
    await byRole(popover, 'button', 'Comment').click()

    await expect.poll(() => stored().filter((a) => a.type === 'note').length).toBe(1)
    const notes = stored().filter((a) => a.type === 'note')
    expect(notes[0]).toMatchObject({ contents: 'Check the date' })
    expect(notes[0]!.inReplyTo).toBeUndefined()
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(1)
    expect(qa(`${POPOVER} [data-ink-thread-item]`)[0]!.textContent).toContain(
      'Check the date'
    )

    // From now on the form replies.
    await byRole(popover, 'textbox', 'Reply').fill('Agreed')
    await byRole(popover, 'button', 'Reply').click()
    await expect.poll(count(`${POPOVER} [data-ink-thread-item]`)).toBe(2)
    const after = stored().filter((a) => a.type === 'note')
    expect(after.find((a) => a.contents === 'Agreed')).toMatchObject({
      inReplyTo: notes[0]!.id,
    })
    await byRole(popover, 'button', 'Close').click()
    await expect.poll(count(POPOVER)).toBe(0)
    await expect
      .poll(focused)
      .toBe(document.querySelector(`[data-annotation="${notes[0]!.id}"]`))
  })

  // React: 'closing a new note without writing anything removes it'
  it('closing a new note without writing anything removes it', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, tool: 'note' })
    await q(`${FIRST} canvas`)
    scroll().focus()
    await userEvent.keyboard('{Enter}')
    await q(POPOVER)
    await expect.poll(count('[data-annotation]')).toBe(1)
    await userEvent.keyboard('{Escape}')
    await expect.poll(count(POPOVER)).toBe(0)
    await expect.poll(count('[data-annotation]')).toBe(0)
    expect(stored()).toEqual([])
    await expect.poll(focused).toBe(scroll())

    // The same through the Close button, for a note added with no text.
    const id = addAnnotation({
      type: 'note',
      page: 0,
      rect: { x: 72, y: 600, width: 24, height: 24 },
    })
    await activate(await q(`[data-annotation="${id}"]`))
    const popover = await q(POPOVER)
    await byRole(popover, 'button', 'Close').click()
    await expect.poll(count(POPOVER)).toBe(0)
    expect(stored()).toEqual([])
  })

  // React: 'with a slow controlled host, a comment submitted just before closing keeps the note'
  it('with a slow controlled host, a comment submitted just before closing keeps the note', async () => {
    const screen = await harness({
      src: fixtureUrl('text-simple'),
      assets,
      controlled: true,
    })
    await q(`${FIRST} canvas`)
    const id = addAnnotation({
      type: 'note',
      page: 0,
      rect: { x: 72, y: 600, width: 24, height: 24 },
    })
    const sel = `[data-annotation="${id}"]`
    await q(sel)
    // From here the host applies each proposal a second late.
    await screen.rerender({ applyDelay: 1000 })
    await activate(await q(sel))
    const popover = await q(POPOVER)
    await byRole(popover, 'textbox', 'Comment').fill('Keep me')
    await byRole(popover, 'button', 'Comment').click()
    // Closed before the host has applied the text: the note is still empty in its list.
    await byRole(popover, 'button', 'Close').click()
    await expect.poll(count(POPOVER)).toBe(0)
    await expect.poll(() => stored().find((a) => a.id === id)?.contents).toBe('Keep me')
    await sleep(1200)
    expect(count(sel)()).toBe(1)
    expect(stored().map((a) => a.id)).toEqual([id])
    expect(
      consoleGuard.problems.every((m) => m.includes('ControlledMutationIgnored'))
    ).toBe(true)
    consoleGuard.clear()
  })

  // React: 'with a slow controlled host, closing an empty note asks for its removal once'
  it('with a slow controlled host, closing an empty note asks for its removal once', async () => {
    const screen = await harness({
      src: fixtureUrl('text-simple'),
      assets,
      controlled: true,
    })
    await q(`${FIRST} canvas`)
    const id = addAnnotation({
      type: 'note',
      page: 0,
      rect: { x: 72, y: 600, width: 24, height: 24 },
    })
    const sel = `[data-annotation="${id}"]`
    await q(sel)
    await expect.element(screen.getByTestId('proposals')).toHaveTextContent('1')
    // From here the host applies each proposal a second late.
    await screen.rerender({ applyDelay: 1000 })
    await activate(await q(sel))
    await q(POPOVER)
    await userEvent.keyboard('{Escape}')
    await expect.poll(count(POPOVER)).toBe(0)
    // The note stays listed until the host applies; it is asked for once, not on every close.
    await sleep(1200)
    await expect.element(screen.getByTestId('proposals')).toHaveTextContent('2')
    await expect.poll(count(sel)).toBe(0)
    expect(consoleGuard.problems).toHaveLength(1)
    expect(consoleGuard.problems[0]).toContain('ControlledMutationIgnored')
    consoleGuard.clear()
  })

  // No React counterpart: pins the drop when activation moves on without a close.
  it('activation moving from one empty note to another removes the first', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const empty = (y: number) =>
      addAnnotation({ type: 'note', page: 0, rect: { x: 72, y, width: 24, height: 24 } })
    const first = empty(600)
    const second = empty(400)
    await activate(await q(`[data-annotation="${first}"]`))
    await q(POPOVER)
    await hitShape(await q(`[data-annotation="${second}"]`)).click()
    await expect.poll(() => stored().map((a) => a.id)).toEqual([second])
    await expect.poll(count(`[data-annotation="${first}"]`)).toBe(0)
    expect(count(`[data-annotation="${second}"]`)()).toBe(1)
    const popover = await q(POPOVER)
    await expect.element(byRole(popover, 'textbox', 'Comment')).toBeVisible()
    expect(count(POPOVER)()).toBe(1)
    await sleep(200)
    expect(stored().map((a) => a.id)).toEqual([second])
  })
})
