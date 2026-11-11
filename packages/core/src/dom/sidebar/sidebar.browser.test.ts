import { Search, Square } from '@inkbar/icons'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { createMemoryStorage } from '../../model/storage'

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
  it('hides the whole sidebar while not visible, its open panel kept', () => {
    const { element, controller } = setup({ visible: false })
    expect(element.hidden).toBe(true)
    controller.update({ visible: true })
    expect(element.hidden).toBe(false)
    expect(controller.isOpen('a')).toBe(true)
  })

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
    // The content sits in the panel's body, under its title, which repeats the label on screen.
    expect(content.a.parentElement!.classList.contains('ink-sidebar-panel-body')).toBe(
      true
    )
    expect(content.a.parentElement!.parentElement).toBe(panels[0])
    const title = panels[0]!.querySelector('.ink-sidebar-panel-title')!
    expect(title.textContent).toBe('Pages')
    expect(title.getAttribute('aria-hidden')).toBe('true')
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

  it('keeps a host class on the root', async () => {
    const { element, triggers } = setup()
    element.classList.add('host-sidebar')
    await userEvent.click(triggers()[1]!)
    expect(element.classList.contains('host-sidebar')).toBe(true)
    expect(element.classList.contains('ink-sidebar')).toBe(true)
  })

  it('a nested sidebar inside a panel keeps its own tabindex', async () => {
    const outer = setup()
    const inner = createSidebar({
      layout: 'tabs',
      panels: [
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
      ],
      content: {},
    })
    cleanup.push(() => inner.controller.destroy())
    outer.content.a.append(inner.element)
    await Promise.resolve()
    const innerTriggers = [
      ...inner.element.querySelectorAll<HTMLButtonElement>('[data-ink-sidebar-trigger]'),
    ]
    const outerTriggers = () => outer.triggers().filter((t) => !inner.element.contains(t))
    expect(innerTriggers.map((t) => t.tabIndex)).toEqual([0, -1])
    outerTriggers()[0]!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(outerTriggers()[1])
    expect(innerTriggers.map((t) => t.tabIndex)).toEqual([0, -1])
    innerTriggers[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(innerTriggers[1])
    expect(innerTriggers.map((t) => t.tabIndex)).toEqual([-1, 0])
    // The outer sidebar ignores the inner one's keys and clicks.
    await userEvent.keyboard('{Enter}')
    expect(inner.controller.state.get().open).toEqual(['y'])
    expect(outer.controller.state.get().open).toEqual(['a'])
    expect(outerTriggers().map((t) => t.tabIndex)).toEqual([-1, 0, -1])
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

describe('the resize handle', () => {
  /**
   * A bare root, as createSidebar and the bindings will render it: the root takes `rootAttrs`
   * and `rootStyle`, the handle `handleAttrs`, and the parent is the container.
   */
  async function setupHandle(opts: Partial<SidebarControllerOptions> = {}) {
    const { createSidebarController } = await import('./controller')
    const controller = createSidebarController({
      panels: [{ id: 'a', label: 'A' }],
      ...opts,
    })
    const parent = document.createElement('div')
    parent.style.width = '1000px'
    const root = document.createElement('div')
    const handle = document.createElement('div')
    handle.style.cssText = 'width: 8px; height: 40px'
    root.append(handle)
    parent.append(root)
    document.body.append(parent)
    const render = () => {
      for (const [k, v] of Object.entries(controller.rootAttrs())) root.setAttribute(k, v)
      if (!('data-resizing' in controller.rootAttrs()))
        root.removeAttribute('data-resizing')
      for (const [k, v] of Object.entries(controller.rootStyle()))
        root.style.setProperty(k, v)
      for (const [k, v] of Object.entries(controller.handleAttrs()))
        handle.setAttribute(k, v)
    }
    render()
    const stopRender = controller.state.subscribe(render)
    const stop = controller.bindHandle(handle)
    cleanup.push(() => {
      stop()
      stopRender()
      controller.destroy()
      parent.remove()
    })
    const shown = () => root.style.getPropertyValue('--ink-sidebar-width')
    const pointer = (type: string, clientX: number, init: PointerEventInit = {}) =>
      handle.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          button: 0,
          isPrimary: true,
          pointerType: 'mouse',
          clientX,
          ...init,
        })
      )
    return { controller, parent, root, handle, shown, pointer }
  }

  it('drag widens a left sidebar and saves on release', async () => {
    const storage = { get: vi.fn(), set: vi.fn(), remove: vi.fn() }
    const { controller, root, shown, pointer } = await setupHandle({ storage })
    const down = pointer('pointerdown', 100)
    expect(down).toBe(false) // preventDefault: no text selection starts
    expect(controller.state.get().resizing).toBe(true)
    expect(root.hasAttribute('data-resizing')).toBe(true)
    pointer('pointermove', 140)
    pointer('pointermove', 160)
    expect(shown()).toBe('380px')
    expect(storage.set).not.toHaveBeenCalled()
    pointer('pointerup', 160)
    expect(controller.state.get()).toMatchObject({ width: 380, resizing: false })
    expect(root.hasAttribute('data-resizing')).toBe(false)
    expect(storage.set).toHaveBeenCalledExactlyOnceWith('sidebar.left.width', 380)
  })

  it('a right sidebar widens when dragged left', async () => {
    const { controller, pointer } = await setupHandle({ side: 'right' })
    pointer('pointerdown', 500)
    pointer('pointermove', 460)
    pointer('pointercancel', 460)
    expect(controller.state.get()).toMatchObject({ width: 360, resizing: false })
  })

  it('touch drag works', async () => {
    const { controller, pointer } = await setupHandle()
    const touch = { pointerType: 'touch', button: 0 }
    pointer('pointerdown', 100, touch)
    pointer('pointermove', 600, touch)
    pointer('pointerup', 600, touch)
    expect(controller.state.get().width).toBe(480)
  })

  it('ignores a secondary mouse button', async () => {
    const { controller, pointer } = await setupHandle()
    pointer('pointerdown', 100, { button: 2 })
    expect(controller.state.get().resizing).toBe(false)
  })

  it('a double-click resets', async () => {
    const { controller, handle } = await setupHandle({ defaultWidth: 300 })
    handle.focus()
    await userEvent.keyboard('{End}')
    expect(controller.state.get().width).toBe(480)
    await userEvent.dblClick(handle)
    expect(controller.state.get().width).toBe(300)
  })

  it('a narrow container shows less but keeps the saved width', async () => {
    const storage = createMemoryStorage({ 'sidebar.left.width': 400 })
    const { parent, shown, handle } = await setupHandle({ storage })
    await expect.poll(shown).toBe('400px')
    parent.style.width = '500px'
    await expect.poll(shown).toBe('250px')
    expect(handle.getAttribute('aria-valuenow')).toBe('250')
    expect(handle.getAttribute('aria-valuemax')).toBe('250')
    expect(storage.get('sidebar.left.width')).toBe(400)
    parent.style.width = '1200px'
    await expect.poll(shown).toBe('400px')
  })

  it('blocked storage still drags', async () => {
    const unhandled = vi.fn()
    window.addEventListener('unhandledrejection', unhandled)
    cleanup.push(() => window.removeEventListener('unhandledrejection', unhandled))
    const storage = {
      get: () => undefined,
      set: () => Promise.reject(new Error('blocked')),
      remove: () => Promise.reject(new Error('blocked')),
    }
    const { controller, pointer } = await setupHandle({ storage })
    pointer('pointerdown', 100)
    pointer('pointermove', 132)
    pointer('pointerup', 132)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(controller.state.get().width).toBe(352)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
