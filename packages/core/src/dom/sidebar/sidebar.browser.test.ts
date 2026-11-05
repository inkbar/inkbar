import { Search, Square } from '@inkbar/icons'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { createSidebar } from './sidebar'

import type { SidebarControllerOptions } from './controller'

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function setup(opts: Partial<SidebarControllerOptions> = {}) {
  const content = {
    a: document.createElement('div'),
    b: document.createElement('div'),
    c: document.createElement('div'),
  }
  content.a.textContent = 'pages'
  content.b.textContent = 'suggestions'
  content.c.textContent = 'search'
  const onOpenChange = vi.fn()
  const { element, controller } = createSidebar({
    panels: [
      { id: 'a', label: 'Pages', icon: Square },
      { id: 'b', label: 'Suggestions', badge: 0 },
      { id: 'c', label: 'Search', icon: Search, badge: 2 },
    ],
    onOpenChange,
    content,
    ...opts,
  })
  document.body.append(element)
  cleanup.push(() => {
    controller.destroy()
    element.remove()
  })
  const triggers = () => [
    ...element.querySelectorAll<HTMLButtonElement>('[data-ink-sidebar-trigger]'),
  ]
  return { element, controller, content, triggers, onOpenChange }
}

describe('createSidebar', () => {
  it('builds the rail with its panels', () => {
    const { element, triggers, content } = setup({ side: 'right' })
    expect(element.matches('.ink-sidebar[data-layout="rail"][data-side="right"]')).toBe(
      true
    )
    const rail = element.querySelector('.ink-sidebar-rail')!
    expect(rail.getAttribute('role')).toBe('tablist')
    expect(rail.getAttribute('aria-orientation')).toBe('vertical')
    expect(triggers()).toHaveLength(3)
    expect(triggers()[0]!.querySelector('svg.ink-icon')).not.toBeNull()
    const panels = element.querySelectorAll<HTMLElement>('.ink-sidebar-panel')
    expect(panels).toHaveLength(3)
    expect(panels[0]!.hidden).toBe(false)
    expect(panels[1]!.hidden).toBe(true)
    expect(content.a.parentElement).toBe(panels[0])
    expect(panels[0]!.getAttribute('aria-labelledby')).toBe(triggers()[0]!.id)
  })

  it('arrow keys move focus between rail buttons; Home/End jump', async () => {
    const { triggers, controller } = setup()
    const [a, b, c] = triggers()
    a!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(b)
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(c)
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(a)
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(c)
    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(a)
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(c)
    // Moving focus does not open anything.
    expect(controller.state.get().open).toEqual(['a'])
    // Left and Right belong to the tabs layout.
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(c)
  })

  it('tabs move with Left and Right', async () => {
    const { triggers, element } = setup({ layout: 'tabs' })
    expect(
      element.querySelector('.ink-sidebar-tabs')?.getAttribute('aria-orientation')
    ).toBe('horizontal')
    const [a, b] = triggers()
    a!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(b)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(a)
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(a)
  })

  it('Enter toggles; focus stays on the trigger', async () => {
    const { triggers, controller, onOpenChange } = setup()
    const [a, b] = triggers()
    b!.focus()
    await userEvent.keyboard('{Enter}')
    expect(controller.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
    expect(document.activeElement).toBe(b)
    expect(b!.getAttribute('aria-selected')).toBe('true')
    expect(a!.getAttribute('aria-selected')).toBe('false')
    await userEvent.keyboard(' ')
    expect(controller.state.get().open).toEqual([])
    expect(document.activeElement).toBe(b)
  })

  it('a click toggles', async () => {
    const { triggers, controller } = setup()
    await userEvent.click(triggers()[2]!)
    expect(controller.state.get().open).toEqual(['c'])
  })

  it('only the focused trigger is tabbable', async () => {
    const { triggers } = setup()
    const tabbable = () => triggers().filter((t) => t.tabIndex === 0)
    expect(tabbable()).toEqual([triggers()[0]])
    triggers()[0]!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(tabbable()).toEqual([triggers()[1]])
  })

  it('every stack header is a Tab stop and Up/Down move between them', async () => {
    const { triggers, element } = setup({ layout: 'stack' })
    expect(element.querySelectorAll('.ink-sidebar-header')).toHaveLength(3)
    expect(triggers().every((t) => t.tabIndex === 0)).toBe(true)
    expect(triggers()[0]!.getAttribute('aria-expanded')).toBe('true')
    triggers()[0]!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(triggers()[1])
    await userEvent.keyboard('{Enter}')
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(triggers()[1])
    expect(triggers().every((t) => t.tabIndex === 0)).toBe(true)
  })

  it('badge 0 and empty are hidden', () => {
    const { element, controller } = setup()
    const badges = () => [...element.querySelectorAll<HTMLElement>('.ink-sidebar-badge')]
    const shown = () => badges().filter((b) => !b.hidden)
    expect(shown().map((b) => b.textContent)).toEqual(['2'])
    controller.update({
      panels: [
        { id: 'a', label: 'Pages', badge: '' },
        { id: 'b', label: 'Suggestions', badge: 5 },
        { id: 'c', label: 'Search', badge: 0 },
      ],
    })
    expect(shown().map((b) => b.textContent)).toEqual(['5'])
  })

  it('content elements keep their DOM when switching', async () => {
    const { triggers, content } = setup()
    const node = content.a.appendChild(document.createElement('input'))
    await userEvent.click(triggers()[1]!)
    await userEvent.click(triggers()[0]!)
    expect(content.a.firstElementChild).toBe(content.a.querySelector('input'))
    expect(content.a.querySelector('input')).toBe(node)
    expect(content.a.isConnected).toBe(true)
  })

  it('keeps content and focus across a layout change', () => {
    const { element, controller, content, triggers } = setup()
    triggers()[1]!.focus()
    controller.update({ layout: 'stack' })
    expect(element.dataset.layout).toBe('stack')
    expect(content.b.isConnected).toBe(true)
    expect(document.activeElement).toBe(triggers()[1])
    expect(element.querySelector('.ink-sidebar-rail')).toBeNull()
  })
})

describe('bindTriggers on framework markup', () => {
  it('finds triggers re-rendered after binding', async () => {
    const { createSidebarController } = await import('./controller')
    const controller = createSidebarController({
      panels: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    const list = document.createElement('div')
    document.body.append(list)
    const render = () => {
      list.replaceChildren(
        ...controller.state.get().panels.map((p) => {
          const b = document.createElement('button')
          for (const [k, v] of Object.entries(controller.triggerAttrs(p.id)))
            b.setAttribute(k, v)
          return b
        })
      )
    }
    render()
    const stop = controller.bindTriggers(list)
    cleanup.push(() => {
      stop()
      controller.destroy()
      list.remove()
    })
    render()
    await Promise.resolve()
    const [a, b] = list.querySelectorAll('button')
    a!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(b)
    expect(b!.tabIndex).toBe(0)
    expect(a!.tabIndex).toBe(-1)
    await userEvent.keyboard('{Enter}')
    expect(controller.state.get().open).toEqual(['b'])
  })
})
