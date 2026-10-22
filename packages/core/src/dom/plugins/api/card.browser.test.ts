import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { writable } from '../../../model/readable'
import { mountContainer, openFixtureInBrowser, until } from '../../test-utils'
import { mountViewer } from '../../viewer-engine'
import { definePlugin, type InkPlugin } from '../define'
import { createPluginHost } from '../host'

import type { CardSpec } from './card'
import type { Records } from './records'
import type { Rect } from '../../../model/geometry'
import type { RecordBase } from '../../../model/records'

interface Finding extends RecordBase {
  page: number
  rect: Rect
  reason: string
  open: boolean
}

const finding = (id: string, y = 500): Finding => ({
  id,
  page: 0,
  rect: { x: 100, y, width: 144, height: 40 },
  reason: `Reason ${id}`,
  open: true,
})

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

type CardFor = (f: Finding, findings: Records<Finding>) => CardSpec

/** The default card: Keep renames the record, Close closes it (its mark goes). */
const defaultCard: CardFor = (f, findings) => ({
  title: f.reason,
  actions: {
    Close: () => findings.update(f.id, { open: false }),
    Keep: () => findings.update(f.id, { reason: `${f.reason}!` }),
  },
})

/** A plugin factory drawing open `findings` as marks with cards from `card`. */
function factoryFor(initial: Finding[], card: CardFor = defaultCard) {
  const handles: Records<Finding>[] = []
  const factory = definePlugin('sandbox', (plugin) => {
    const findings = plugin.records<Finding>('findings', { initial: () => initial })
    handles.push(findings)
    plugin.marks(findings, {
      where: (f) => f.open,
      rect: (f) => f.rect,
      label: (f) => f.reason,
      card: (f) => card(f, findings),
    })
  })
  return { factory, handles }
}

/** A viewer running `plugin`, in a root and scroll element as `createViewer` makes them. */
async function mount(plugin: InkPlugin) {
  const doc = await openFixtureInBrowser('text-simple')
  const root = mountContainer(800, 600)
  root.setAttribute('data-ink-root', '')
  const container = document.createElement('div')
  container.setAttribute('data-ink-scroll', '')
  container.tabIndex = 0
  container.style.cssText = 'width:100%;height:100%;position:relative;'
  root.append(container)
  const plugins = createPluginHost({
    plugins: [plugin],
    document: writable(doc),
    history: () => doc.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(container),
  })
  const engine = mountViewer({ container, document: doc, zoom: 1, plugins })
  cleanup.push(() => {
    engine.destroy()
    plugins.destroy()
    doc.destroy()
    root.remove()
  })
  await until(() => engine.pages.size > 0)
  const markFor = (id: string) =>
    container.querySelector<HTMLButtonElement>(`button[data-record="${id}"]`)
  return { doc, container, markFor }
}

async function setup(initial: Finding[], card?: CardFor) {
  const { factory, handles } = factoryFor(initial, card)
  const viewer = await mount(factory())
  return { ...viewer, findings: handles[0]! }
}

/** The shown card, if one is. */
const openCard = () =>
  [...document.querySelectorAll<HTMLElement>('[data-ink-popover].ink-card')].find(
    (el) => !el.hidden
  )
const actionsOf = (card: HTMLElement) => [
  ...card.querySelectorAll<HTMLButtonElement>('.ink-card-actions > button'),
]

describe('plugin.marks card', () => {
  it('activating a mark opens its card next to it with the first action focused', async () => {
    const { markFor } = await setup([finding('a')], (f) => ({
      title: f.reason,
      meta: 'High confidence',
      swatch: 'rgb(255, 0, 0)',
      body: 'Because.',
      className: 'sandbox-card',
      actions: { Accept: () => {}, Dismiss: () => {} },
    }))
    const mark = markFor('a')!
    await userEvent.click(mark)
    const card = openCard()!
    expect(card).toBeDefined()
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.classList.contains('sandbox-card')).toBe(true)
    expect(card.querySelector('.ink-card-title')?.textContent).toBe('Reason a')
    const meta = card.querySelector('.ink-card-meta')!
    expect(meta.textContent).toBe('High confidence')
    const swatch = meta.firstElementChild as HTMLElement
    expect(swatch.classList.contains('ink-card-swatch')).toBe(true)
    expect(swatch.style.background).toBe('rgb(255, 0, 0)')
    expect(card.querySelector('.ink-card-body')?.textContent).toBe('Because.')
    const actions = actionsOf(card)
    expect(actions.map((b) => b.textContent)).toEqual(['Accept', 'Dismiss'])
    expect(actions.every((b) => b.type === 'button')).toBe(true)
    expect(document.activeElement).toBe(actions[0])

    const m = mark.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    expect(c.top >= m.bottom || c.bottom <= m.top).toBe(true)
    expect(Math.abs(c.left - m.left)).toBeLessThan(1)
  })

  it('leaves meta and body out when not given', async () => {
    const { markFor } = await setup([finding('a')])
    await userEvent.click(markFor('a')!)
    const card = openCard()!
    expect(card.querySelector('.ink-card-meta')).toBeNull()
    expect(card.querySelector('.ink-card-body')).toBeNull()
    expect(card.querySelector('.ink-card-swatch')).toBeNull()
  })

  it('each action runs in one undo step', async () => {
    const { doc, findings, markFor } = await setup([finding('a')], (f, findings) => ({
      title: f.reason,
      actions: {
        Both: () => {
          findings.update(f.id, { reason: 'One' })
          findings.update(f.id, { reason: 'Two' })
        },
      },
    }))
    await userEvent.click(markFor('a')!)
    await userEvent.click(actionsOf(openCard()!)[0]!)
    expect(findings.find('a')?.reason).toBe('Two')
    doc.history.undo()
    expect(findings.find('a')?.reason).toBe('Reason a')
  })

  it('after an action that removes the mark, the card closes and focus moves to the next mark, else the previous, else the viewport', async () => {
    const { container, markFor } = await setup([
      finding('a', 600),
      finding('b', 500),
      finding('c', 400),
    ])
    const close = async (id: string) => {
      await userEvent.click(markFor(id)!)
      await userEvent.click(actionsOf(openCard()!)[0]!)
      expect(markFor(id)).toBeNull()
      expect(openCard()).toBeUndefined()
    }

    await close('b')
    expect(document.activeElement).toBe(markFor('c'))
    await close('c')
    expect(document.activeElement).toBe(markFor('a'))
    await close('a')
    await until(() => document.activeElement === container)
  })

  it('after an action that keeps the mark, the card re-renders from the record', async () => {
    const { markFor } = await setup([finding('a')])
    await userEvent.click(markFor('a')!)
    const card = openCard()!
    await userEvent.click(actionsOf(card)[1]!)
    expect(openCard()).toBe(card)
    expect(card.querySelector('.ink-card-title')?.textContent).toBe('Reason a!')
    expect(card.getAttribute('aria-label')).toBe('Reason a!')
    expect(document.activeElement).toBe(actionsOf(card)[1])
    // The actions see the record as it now stands.
    await userEvent.click(actionsOf(card)[1]!)
    expect(card.querySelector('.ink-card-title')?.textContent).toBe('Reason a!!')
  })

  it('a record change while the card is open re-renders it; if the mark goes, the card closes', async () => {
    const { findings, markFor } = await setup([finding('a'), finding('b', 300)])
    await userEvent.click(markFor('a')!)
    const card = openCard()!
    findings.update('a', { reason: 'Changed' })
    expect(card.querySelector('.ink-card-title')?.textContent).toBe('Changed')
    expect(document.activeElement).toBe(actionsOf(card)[0])
    findings.update('b', { reason: 'Other' })
    expect(openCard()).toBe(card)
    findings.update('a', { open: false })
    expect(openCard()).toBeUndefined()
  })

  it('Escape and a press outside close it and return focus to the mark', async () => {
    const { markFor } = await setup([finding('a')])
    const mark = markFor('a')!
    await userEvent.click(mark)
    expect(openCard()).toBeDefined()
    await userEvent.keyboard('{Escape}')
    expect(openCard()).toBeUndefined()
    await until(() => document.activeElement === mark)

    await userEvent.click(mark)
    expect(openCard()).toBeDefined()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(openCard()).toBeUndefined()
    await until(() => document.activeElement === mark)
  })

  it('a mark with a card has aria-haspopup="dialog", and aria-expanded true while its card is open', async () => {
    const { markFor } = await setup([finding('a'), finding('b', 300)])
    const a = markFor('a')!
    const b = markFor('b')!
    for (const mark of [a, b]) {
      expect(mark.getAttribute('aria-haspopup')).toBe('dialog')
      expect(mark.getAttribute('aria-expanded')).toBe('false')
    }
    await userEvent.click(a)
    expect(a.getAttribute('aria-expanded')).toBe('true')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    await userEvent.keyboard('{Escape}')
    expect(a.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    // Keep renames the record: the mark redraws and its card stays open.
    await userEvent.click(actionsOf(openCard()!)[1]!)
    expect(markFor('b')!.getAttribute('aria-expanded')).toBe('true')
    // Close removes the mark; the card closes and focus moves to `a`.
    await userEvent.click(actionsOf(openCard()!)[0]!)
    expect(document.activeElement).toBe(a)
    expect(a.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(a)
    expect(a.getAttribute('aria-expanded')).toBe('true')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(a.getAttribute('aria-expanded')).toBe('false')
  })

  it('label names the dialog; it defaults to title', async () => {
    const { findings, markFor } = await setup([finding('a')], (f) => ({
      title: f.reason,
      ...(f.reason === 'Labelled' ? { label: 'Suggested redaction' } : {}),
      actions: { Ok: () => {} },
    }))
    await userEvent.click(markFor('a')!)
    const card = openCard()!
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.getAttribute('aria-label')).toBe('Reason a')
    findings.update('a', { reason: 'Labelled' })
    expect(card.getAttribute('aria-label')).toBe('Suggested redaction')
  })

  it('two viewers using one factory open their own cards', async () => {
    const { factory } = factoryFor([finding('a')])
    const one = await mount(factory())
    const two = await mount(factory())
    await userEvent.click(one.markFor('a')!)
    const first = openCard()!
    await userEvent.click(two.markFor('a')!)
    const second = openCard()!
    expect(second).not.toBe(first)
    expect(first.hidden).toBe(true)
    expect(document.activeElement).toBe(actionsOf(second)[0])

    // Closing in the second viewer moves focus within it.
    await userEvent.click(actionsOf(second)[0]!)
    expect(two.markFor('a')).toBeNull()
    expect(one.markFor('a')).not.toBeNull()
    await until(() => document.activeElement === two.container)
  })
})
