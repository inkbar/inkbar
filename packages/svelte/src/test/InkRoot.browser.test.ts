import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'

import InkRoot from '../lib/components/InkRoot.svelte'

import { guardConsole } from './console-guard.js'
import { attr, count, gateFetch, q, sleep } from './dom.js'
import BoundHost from './harness/BoundHost.svelte'
import ControlledHost from './harness/ControlledHost.svelte'
import EventHost from './harness/EventHost.svelte'
import UnboundHost from './harness/UnboundHost.svelte'
import UncontrolledHost from './harness/UncontrolledHost.svelte'

import type { Annotation } from '@inkbar/core'

const assets = browserAssets()
const consoleGuard = guardConsole()

type DocHandle = {
  annotations: {
    mode: string
    add(i: unknown): void
    list: { get(): unknown[] }
  }
  history: { canUndo: { get(): boolean } }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle & { __marker?: number } }

const root = () => document.querySelector<RootEl>('[data-ink-root]')!
const doc = () => root().__inkDocument!
const note = { type: 'text', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } }
/** The page's `fetch` as a value: compared by identity, never called. */
// eslint-disable-next-line @typescript-eslint/unbound-method
const currentFetch = (): unknown => window.fetch

describe('InkRoot', () => {
  // React: 'calls onReady and reflects state on the root element'
  it('calls onReady and reflects state on the root element', async () => {
    const events: string[] = []
    await render(InkRoot, {
      src: fixtureUrl('text-simple'),
      assets,
      onReady: () => events.push('ready'),
      onError: () => events.push('error'),
    })
    const el = await q('[data-ink-root]')
    expect(el.getAttribute('data-ink-root')).toBe('')
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    expect(events).toEqual(['ready'])
  })

  // React: 'is loading from the moment the document starts opening'
  it('is loading from the moment the document starts opening', async () => {
    const fetchBefore = currentFetch()
    const gate = gateFetch('text-simple.pdf')
    try {
      expect(currentFetch()).not.toBe(fetchBefore)
      await render(InkRoot, { src: fixtureUrl('text-simple'), assets })
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('loading')
      await sleep(100)
      expect(attr('[data-ink-root]', 'data-state')()).toBe('loading')
      gate.release()
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    } finally {
      gate.restore()
    }
    // The gate puts back the very function it replaced, not a copy of it.
    expect(currentFetch()).toBe(fetchBefore)
  })

  // React: 'stays idle without a source'
  it('stays idle without a source', async () => {
    await render(InkRoot, { src: null, assets })
    const el = await q('[data-ink-root]')
    expect(el.getAttribute('data-state')).toBe('idle')
  })

  // React: 'calls onError with the code for an encrypted file and opens with the password'
  it('calls onError with the code for an encrypted file and opens with the password', async () => {
    const screen = await render(EventHost, { src: fixtureUrl('encrypted-aes'), assets })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('error')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('PasswordRequired')
    await screen.rerender({ password: 'inkbar' })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('PasswordRequired')
  })

  // React: 'retries a byte source with a password: wrong, then right, with the host bytes intact'
  it('retries a byte source with a password: wrong, then right, with the host bytes intact', async () => {
    const size = (await (await fetch(fixtureUrl('encrypted-aes'))).arrayBuffer())
      .byteLength
    const screen = await render(EventHost, {
      src: null,
      assets,
      bytesFrom: fixtureUrl('encrypted-aes'),
      password: 'wrong',
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('error')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('PasswordRequired')
    await expect
      .element(screen.getByTestId('byte-length'))
      .toHaveTextContent(String(size))
    await screen.rerender({ password: 'inkbar' })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('PasswordRequired')
    await expect
      .element(screen.getByTestId('byte-length'))
      .toHaveTextContent(String(size))
  })

  // React: 'calls onError when the file fails to load after openDocument resolves'
  it('calls onError when the file fails to load after openDocument resolves', async () => {
    // openDocument resolves for load failures and reports them through status, not by rejecting.
    const screen = await render(EventHost, {
      src: fixtureUrl('malformed-truncated'),
      assets,
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('error')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('InvalidPdf')
    // The PDF engine's recovery warnings come from its worker and never reach this console.
    expect(consoleGuard.problems).toEqual([])
  })

  // React: 'surfaces a missing asset config through status and onError instead of throwing'
  it('surfaces a missing asset config through status and onError instead of throwing', async () => {
    const screen = await render(EventHost, {
      src: fixtureUrl('text-simple'),
      assets: { ...assets, worker: '' },
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('error')
    await expect
      .element(screen.getByTestId('error-codes'))
      .toHaveTextContent('AssetConfigMissing')
  })

  // React: 'does not reload when only the URL or a callback changes but the key is stable; reloads on a new key'
  it('does not reload when only the URL or a callback changes but the key is stable; reloads on a new key', async () => {
    let ready = 0
    const screen = await render(InkRoot, {
      src: { url: fixtureUrl('text-simple') + '?sig=1', key: 'doc-1' },
      assets,
      onReady: () => ready++,
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    expect(ready).toBe(1)
    doc().__marker = 1
    // New URL, new callback identities, same key.
    await screen.rerender({
      src: { url: fixtureUrl('text-simple') + '?sig=2', key: 'doc-1' },
      onReady: () => ready++,
      onAnnotationsChange: () => undefined,
    })
    await sleep(300)
    expect(ready).toBe(1)
    // Same document object: nothing was destroyed and reopened behind our back.
    expect(doc().__marker).toBe(1)
    await screen.rerender({
      src: { url: fixtureUrl('text-simple') + '?sig=3', key: 'doc-2' },
    })
    await expect.poll(() => ready).toBe(2)
    expect(doc().__marker).toBeUndefined()
  })

  // React: 'controlled annotations: onAnnotationsChange receives proposals and the store follows the prop'
  it('a function binding receives proposals and the store follows only what the host applies (Review Focus 2)', async () => {
    const received: Annotation[][] = []
    const changes: string[] = []
    const screen = await render(BoundHost, {
      src: fixtureUrl('text-simple'),
      assets,
      withhold: true,
      onProposal: (next: Annotation[]) => received.push(next),
      onChange: (kind: string) => changes.push(kind),
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    doc().annotations.add(note)
    await expect.poll(() => received.length).toBe(1)
    expect(changes).toEqual(['add'])
    expect(doc().annotations.list.get().length).toBe(0)
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('0')
    // Core warns when the host has not applied a proposal yet; that is the state under test.
    await expect.poll(() => consoleGuard.problems.length).toBe(1)
    expect(consoleGuard.problems[0]).toContain('ControlledMutationIgnored')
    consoleGuard.clear()
    await screen.getByTestId('apply').click()
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    await expect.poll(() => doc().annotations.list.get().length).toBe(1)
  })

  // New: the plain `bind:annotations` path a Svelte host would use.
  it('bind:annotations applies each proposal at once and the host sees the list', async () => {
    const screen = await render(BoundHost, { src: fixtureUrl('text-simple'), assets })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    doc().annotations.add(note)
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    await expect.poll(() => doc().annotations.list.get().length).toBe(1)
    await sleep(100)
    expect(consoleGuard.problems).toEqual([])
  })

  // New: the other half of Review Focus 2, a host that passes the prop without binding it.
  it('an unbound annotations prop is overridden locally: the store follows, the host only hears the callback', async () => {
    const received: Annotation[][] = []
    const screen = await render(UnboundHost, {
      src: fixtureUrl('text-simple'),
      assets,
      onProposal: (next: Annotation[]) => received.push(next),
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    doc().annotations.add(note)
    await expect.element(screen.getByTestId('heard')).toHaveTextContent('1')
    expect(received[0]?.length).toBe(1)
    await expect.poll(() => doc().annotations.list.get().length).toBe(1)
    // The host's own list never moved, and Svelte raised no ownership or binding warning.
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('0')
    await sleep(100)
    expect(consoleGuard.problems).toEqual([])
    // A new value from the host takes the prop back.
    await screen.getByTestId('reset').click()
    await expect.poll(() => doc().annotations.list.get().length).toBe(0)
  })

  // React: 'passing the annotations prop to an open uncontrolled document leaves its mode alone'
  it('passing the annotations prop to an open uncontrolled document leaves its mode alone', async () => {
    const received: Annotation[][] = []
    const screen = await render(InkRoot, { src: fixtureUrl('text-simple'), assets })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    doc().__marker = 1
    await screen.rerender({
      annotations: [],
      onAnnotationsChange: (next: Annotation[]) => received.push(next),
    })
    await sleep(100)
    // Same document, still uncontrolled: an add lands in the store and proposes nothing.
    expect(doc().__marker).toBe(1)
    doc().annotations.add(note)
    expect(doc().annotations.mode).toBe('uncontrolled')
    expect(doc().annotations.list.get().length).toBe(1)
    await sleep(50)
    expect(received).toEqual([])
    // Dropping the prop again changes nothing either.
    await screen.rerender({ annotations: undefined, onAnnotationsChange: undefined })
    expect(doc().annotations.list.get().length).toBe(1)
  })

  // React: 'controlled annotations that change while the document opens reach the store'
  it('controlled annotations that change while the document opens reach the store', async () => {
    const late: Annotation = {
      id: 'late-note',
      type: 'text',
      icon: 'Comment',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
      color: '#ffd400',
      opacity: 1,
      createdAt: '2026-10-12T00:00:00.000Z',
      modifiedAt: '2026-10-12T00:00:00.000Z',
      source: 'session',
    }
    const gate = gateFetch('text-simple.pdf')
    try {
      const screen = await render(InkRoot, {
        src: fixtureUrl('text-simple'),
        assets,
        annotations: [],
      })
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('loading')
      await screen.rerender({ annotations: [late] })
      gate.release()
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
      const ids = doc()
        .annotations.list.get()
        .map((a) => (a as { id: string }).id)
      expect(ids).toEqual(['late-note'])
    } finally {
      gate.restore()
    }
  })

  // React: 'controlled lists proposed outside a React event reach the store before core checks'
  it('controlled lists proposed from outside any event reach the store before core checks', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
    })
    await expect.poll(attr('[data-testid="probe"]', 'data-ready')).toBe('true')
    await Promise.resolve()
    for (let i = 0; i < 3; i++) doc().annotations.add(note)
    await sleep(100)
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('3')
    expect(consoleGuard.problems).toEqual([])
  })

  // React: 'a host that adds from a useEffect after ready raises no React or core warnings'
  it('a host that adds from an effect after ready raises no warnings', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
      addOnReady: true,
    })
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    await sleep(100)
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    expect(consoleGuard.problems).toEqual([])
  })

  // React: 'uncontrolled by default, with history enabled'
  it('uncontrolled by default, with history enabled', async () => {
    await render(InkRoot, { src: fixtureUrl('text-simple'), assets })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    doc().annotations.add(note)
    expect(doc().history.canUndo.get()).toBe(true)
  })

  // React: 'hooks bind to the document, tool and core history'
  it('hooks bind to the document, tool and core history (Review Focus 1)', async () => {
    const screen = await render(UncontrolledHost, {
      src: fixtureUrl('text-simple'),
      assets,
    })
    const probe = '[data-testid="probe"]'
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await expect.poll(attr(probe, 'data-pages')).toBe('3')
    await expect.poll(attr(probe, 'data-count')).toBe('3')
    await expect.poll(attr(probe, 'data-current')).toBe('0')
    await expect.poll(attr(probe, 'data-embedded')).toBe('0')
    await expect.poll(attr(probe, 'data-tool')).toBe('select-text')
    await expect.poll(attr(probe, 'data-zoom')).toBe('fit-width')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')

    await screen.getByTestId('add').click()
    await expect.poll(attr(probe, 'data-annotations')).toBe('1')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('true')
    await screen.getByTestId('select').click()
    await expect.poll(attr(probe, 'data-selection')).not.toBe('')
    await screen.getByTestId('undo').click()
    await expect.poll(attr(probe, 'data-annotations')).toBe('0')
    await expect.poll(attr(probe, 'data-selection')).toBe('')
    await expect.poll(attr(probe, 'data-can-redo')).toBe('true')
    await screen.getByTestId('highlight').click()
    await expect.poll(attr(probe, 'data-tool')).toBe('highlight')
  })

  // React: 'embedded summary comes from the file'
  it('embedded summary comes from the file', async () => {
    await render(UncontrolledHost, { src: fixtureUrl('annotated-markup'), assets })
    const probe = '[data-testid="probe"]'
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await expect.poll(attr(probe, 'data-embedded')).not.toBe('0')
  })

  // React: 'controlled hosts get a snapshot undo stack through useHistory'
  it('controlled hosts get a snapshot undo stack through useHistory', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
      history: true,
    })
    const probe = '[data-testid="probe"]'
    const hostCount = screen.getByTestId('host-count')
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')

    await screen.getByTestId('add').click()
    await screen.getByTestId('add').click()
    await expect.element(hostCount).toHaveTextContent('2')
    await expect.poll(attr(probe, 'data-annotations')).toBe('2')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('true')

    await screen.getByTestId('undo').click()
    await expect.element(hostCount).toHaveTextContent('1')
    await expect.poll(attr(probe, 'data-annotations')).toBe('1')
    await expect.poll(attr(probe, 'data-can-redo')).toBe('true')
    await screen.getByTestId('undo').click()
    await expect.element(hostCount).toHaveTextContent('0')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')

    await screen.getByTestId('redo').click()
    await expect.element(hostCount).toHaveTextContent('1')
    await screen.getByTestId('add').click()
    await expect.element(hostCount).toHaveTextContent('2')
    await expect.poll(attr(probe, 'data-can-redo')).toBe('false')
  })

  // React: 'a host passing a fresh array of the same content each render keeps one undo step'
  it('a host handing back a fresh array of the same content keeps one undo step', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
      history: true,
      spreadOnRender: true,
    })
    const probe = '[data-testid="probe"]'
    const hostCount = screen.getByTestId('host-count')
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await screen.getByTestId('add').click()
    await expect.element(hostCount).toHaveTextContent('1')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('true')

    await screen.getByTestId('bump').click()
    await screen.getByTestId('bump').click()
    await expect.element(screen.getByTestId('bump')).toHaveTextContent('2')
    await expect.element(hostCount).toHaveTextContent('1')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('true')
    await expect.poll(attr(probe, 'data-can-redo')).toBe('false')
    // One undo step only: a snapshot loop would have pushed more.
    await screen.getByTestId('undo').click()
    await expect.element(hostCount).toHaveTextContent('0')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')
  })

  it('batch records a run of additions as one undo step', async () => {
    const screen = await render(UncontrolledHost, {
      src: fixtureUrl('text-simple'),
      assets,
    })
    const probe = '[data-testid="probe"]'
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await screen.getByTestId('batch9').click()
    await expect.poll(attr(probe, 'data-annotations')).toBe('9')
    await screen.getByTestId('undo').click()
    await expect.poll(attr(probe, 'data-annotations')).toBe('0')
    await expect.poll(attr(probe, 'data-can-redo')).toBe('true')
  })

  it('batch in a controlled host reaches the host as one undo step', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
      history: true,
    })
    const probe = '[data-testid="probe"]'
    const hostCount = screen.getByTestId('host-count')
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await screen.getByTestId('batch3').click()
    await expect.element(hostCount).toHaveTextContent('3')
    await expect.poll(attr(probe, 'data-annotations')).toBe('3')
    await screen.getByTestId('undo').click()
    await expect.element(hostCount).toHaveTextContent('0')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')
  })

  // React: 'controlled hosts without history get inert undo'
  it('controlled hosts without history get inert undo', async () => {
    const screen = await render(ControlledHost, {
      src: fixtureUrl('text-simple'),
      assets,
    })
    const probe = '[data-testid="probe"]'
    await expect.poll(attr(probe, 'data-ready')).toBe('true')
    await screen.getByTestId('add').click()
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    await expect.poll(attr(probe, 'data-can-undo')).toBe('false')
    // Controlled documents never enable core's own stack.
    expect(doc().history.canUndo.get()).toBe(false)
  })

  // New: the instance exports and the `ref` binding.
  it('exposes history, getDocument, getStatus and the root element to a bound host', async () => {
    const screen = await render(BoundHost, {
      src: fixtureUrl('text-simple'),
      assets,
      history: true,
    })
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    await expect.element(screen.getByTestId('handle-status')).toHaveTextContent('ready')
    await expect
      .element(screen.getByTestId('handle-has-document'))
      .toHaveTextContent('true')
    await expect
      .element(screen.getByTestId('handle-ref'))
      .toHaveTextContent('data-ink-root')
    doc().annotations.add(note)
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
    // The handle's history is the live one: it reports the undo step, and clearing drops it.
    await expect.element(screen.getByTestId('handle-can-undo')).toHaveTextContent('true')
    await expect.poll(attr('[data-testid="probe"]', 'data-can-undo')).toBe('true')
    await screen.getByTestId('clear-history').click()
    flushSync()
    expect(count('[data-ink-root]')()).toBe(1)
    await expect.element(screen.getByTestId('handle-can-undo')).toHaveTextContent('false')
    await expect.poll(attr('[data-testid="probe"]', 'data-can-undo')).toBe('false')
    // The list itself is untouched.
    await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
  })

  // New: `usePage().next()` and `previous()` pass the neighbouring index on and core clamps it.
  it('usePage next and previous stop at the first and the last page', async () => {
    const screen = await render(UncontrolledHost, {
      src: fixtureUrl('text-simple'),
      assets,
      withViewport: true,
    })
    const probe = '[data-testid="probe"]'
    const scrollTop = () => document.querySelector('[data-ink-scroll]')!.scrollTop
    await q('.ink-page[data-page="0"] canvas')
    await expect.poll(attr(probe, 'data-count')).toBe('3')
    expect(attr(probe, 'data-current')()).toBe('0')

    await screen.getByTestId('previous').click()
    await sleep(100)
    expect(attr(probe, 'data-current')()).toBe('0')
    expect(scrollTop()).toBe(0)

    await screen.getByTestId('next').click()
    await expect.poll(attr(probe, 'data-current')).toBe('1')
    await screen.getByTestId('next').click()
    await expect.poll(attr(probe, 'data-current')).toBe('2')
    const last = scrollTop()
    expect(last).toBeGreaterThan(1500)
    await screen.getByTestId('next').click()
    await sleep(100)
    expect(attr(probe, 'data-current')()).toBe('2')
    expect(scrollTop()).toBe(last)

    // And back down from the last page, so the clamp did not leave the hook stuck.
    await screen.getByTestId('previous').click()
    await expect.poll(attr(probe, 'data-current')).toBe('1')
    expect(consoleGuard.problems).toEqual([])
  })

  // New: the `child` snippet.
  it('renders the host element through the child snippet and still provides the context', async () => {
    const screen = await render(BoundHost, {
      src: fixtureUrl('text-simple'),
      assets,
      asChild: true,
    })
    const el = await q('section[data-ink-root]')
    await expect.poll(attr('section[data-ink-root]', 'data-state')).toBe('ready')
    expect(el.classList.contains('host-root')).toBe(true)
    await expect.poll(attr('[data-testid="probe"]', 'data-ready')).toBe('true')
    await expect
      .element(screen.getByTestId('handle-ref'))
      .toHaveTextContent('data-ink-root')
  })

  // New: without a `defaults` prop the colours come from the theme variables on the root
  // element, which the open has to have in hand however that element is rendered.
  it('takes colour defaults from the theme variables on the root element, its own or the child snippet one', async () => {
    for (const asChild of [false, true]) {
      const screen = await render(BoundHost, {
        src: fixtureUrl('text-simple'),
        assets,
        asChild,
        noteColor: '#12ab34',
      })
      const selector = asChild ? 'section[data-ink-root]' : 'div[data-ink-root]'
      await expect.poll(attr(selector, 'data-state')).toBe('ready')
      doc().annotations.add(note)
      await expect.element(screen.getByTestId('host-count')).toHaveTextContent('1')
      const colours = doc()
        .annotations.list.get()
        .map((a) => (a as { color: string }).color)
      expect(colours).toEqual(['#12AB34'])
      await screen.unmount()
    }
  })

  // React: 'the theme keeps a .light root light inside a .dark ancestor'
  it('the theme keeps a .light root light inside a .dark ancestor', async () => {
    const inkBg = (el: Element) =>
      getComputedStyle(el).getPropertyValue('--ink-bg').trim()
    document.body.classList.add('dark')
    try {
      const dark = await render(InkRoot, { src: null, assets })
      await expect.poll(() => inkBg(dark.container.firstElementChild!)).toBe('#0f1217')
      await dark.unmount()
      const light = await render(InkRoot, { src: null, assets, class: 'light' })
      const el = light.container.firstElementChild!
      expect(el.classList.contains('light')).toBe(true)
      await expect.poll(() => inkBg(el)).toBe('#f1f2f5')
    } finally {
      document.body.classList.remove('dark')
    }
  })
})
