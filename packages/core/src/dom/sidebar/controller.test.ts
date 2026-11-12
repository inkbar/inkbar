import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMemoryStorage } from '../../model/storage'

import { createSidebarController, sidebarBadge, SIDEBAR_WIDTH } from './controller'

import type { SidebarControllerOptions, SidebarPanelInfo } from './controller'
import type { InkStorage } from '../../model/storage'

const panels: SidebarPanelInfo[] = [
  { id: 'a', label: 'Pages' },
  { id: 'b', label: 'Suggestions', badge: 3 },
  { id: 'c', label: 'Search' },
]

function make(opts: Partial<SidebarControllerOptions> = {}) {
  const onOpenChange = vi.fn()
  const c = createSidebarController({ panels, onOpenChange, ...opts })
  return { c, onOpenChange }
}

describe('createSidebarController', () => {
  it('rail starts with the first panel open', () => {
    const { c } = make()
    expect(c.state.get()).toMatchObject({ layout: 'rail', side: 'left', open: ['a'] })
    expect(c.isOpen('a')).toBe(true)
    expect(c.isOpen('b')).toBe(false)
  })

  it('hides the whole sidebar while not visible and keeps what was open', () => {
    const c = createSidebarController({ panels, visible: false })
    expect(c.rootAttrs().hidden).toBe('')
    expect(c.state.get().visible).toBe(false)
    c.toggle('b')
    c.update({ visible: true })
    expect(c.rootAttrs()).not.toHaveProperty('hidden')
    expect(c.state.get().open).toEqual(['b'])
    c.update({ visible: false })
    expect(c.state.get().open).toEqual(['b'])
  })

  it('tells a panel its layout, for the rail-only title', () => {
    const c = createSidebarController({ panels })
    expect(c.panelAttrs('a')['data-layout']).toBe('rail')
    c.update({ layout: 'tabs' })
    expect(c.panelAttrs('a')['data-layout']).toBe('tabs')
  })

  it('toggling the open rail panel closes it', () => {
    const { c, onOpenChange } = make()
    c.toggle('a')
    expect(c.state.get().open).toEqual([])
    expect(onOpenChange).toHaveBeenLastCalledWith(null)
    c.toggle('b')
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
  })

  it('tabs keep one open; toggle switches', () => {
    const { c, onOpenChange } = make({ layout: 'tabs' })
    c.toggle('a')
    expect(c.state.get().open).toEqual(['a'])
    expect(onOpenChange).not.toHaveBeenCalled()
    c.toggle('b')
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
  })

  it('tabs collapse as a whole through open', () => {
    const { c } = make({ layout: 'tabs', open: null })
    expect(c.state.get().open).toEqual([])
    c.update({ open: 'c' })
    expect(c.state.get().open).toEqual(['c'])
  })

  it('stack opens any number', () => {
    const { c, onOpenChange } = make({ layout: 'stack' })
    expect(c.state.get().open).toEqual(['a'])
    c.toggle('b')
    expect(onOpenChange).toHaveBeenLastCalledWith(['a', 'b'])
    expect(c.state.get().open).toEqual(['a', 'b'])
    c.toggle('a')
    expect(onOpenChange).toHaveBeenLastCalledWith(['b'])
  })

  it('controlled open is not changed by toggle until the host updates', () => {
    const { c, onOpenChange } = make({ open: 'a' })
    c.toggle('b')
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
    expect(c.state.get().open).toEqual(['a'])
    c.update({ open: 'b' })
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown ids', () => {
    const { c, onOpenChange } = make()
    c.toggle('zzz')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(c.isOpen('zzz')).toBe(false)
  })

  it.each(['rail', 'tabs'] as const)(
    'removing the open panel opens the first remaining (%s)',
    (layout) => {
      const { c, onOpenChange } = make({ layout })
      c.update({ panels: panels.slice(1) })
      expect(c.state.get().open).toEqual(['b'])
      expect(onOpenChange).toHaveBeenLastCalledWith('b')
    }
  )

  it('removing a closed rail panel keeps the rail closed', () => {
    const { c, onOpenChange } = make({ open: null })
    c.update({ panels: panels.slice(1) })
    expect(c.state.get().open).toEqual([])
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('removing the open panel drops it from stack', () => {
    const { c, onOpenChange } = make({ layout: 'stack', open: ['a', 'c'] })
    c.update({ panels: panels.slice(1) })
    expect(c.state.get().open).toEqual(['c'])
    expect(onOpenChange).toHaveBeenLastCalledWith(['c'])
  })

  it('removing the open panel in controlled mode shows and reports the fallback', () => {
    const { c, onOpenChange } = make({ open: 'a' })
    // A binding passes the host's stale open along with the new panels.
    c.update({ panels: panels.slice(1), open: 'a' })
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
    c.update({ open: 'b' })
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  it('an uncontrolled sidebar opens its first panel once panels arrive, quietly', () => {
    const { c, onOpenChange } = make({ panels: [] })
    expect(c.state.get().open).toEqual([])
    c.update({ panels: panels.slice(0, 1) })
    expect(c.state.get().open).toEqual(['a'])
    c.update({ panels })
    expect(c.state.get().open).toEqual(['a'])
    const stack = make({ panels: [], layout: 'stack' })
    stack.c.update({ panels: panels.slice(1) })
    expect(stack.c.state.get().open).toEqual(['b'])
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(stack.onOpenChange).not.toHaveBeenCalled()
  })

  it('while pending, a controlled open id not registered yet is kept, not replaced', () => {
    const { c, onOpenChange } = make({ panels: [], open: 'b', pending: true })
    expect(c.rootAttrs()['data-state']).toBe('open')
    expect(c.isOpen('b')).toBe(true)
    c.update({ panels: panels.slice(0, 1), open: 'b' })
    expect(c.state.get().open).toEqual(['b'])
    expect(c.isOpen('a')).toBe(false)
    c.update({ panels: panels.slice(0, 2), open: 'b' })
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).not.toHaveBeenCalled()
    // Done registering: an id still missing is a removed panel, and falls back as one.
    const late = make({ panels: [], open: 'z', pending: true })
    late.c.update({ panels })
    expect(late.c.state.get().open).toEqual(['z'])
    late.c.update({ pending: false })
    expect(late.c.state.get().open).toEqual(['a'])
    expect(late.onOpenChange).toHaveBeenCalledWith('a')
  })

  it('while pending, stack keeps the expanded ids in panel order, unregistered ones last', () => {
    const { c, onOpenChange } = make({
      panels: [],
      layout: 'stack',
      open: ['c', 'a'],
      pending: true,
    })
    c.update({ panels: panels.slice(0, 1), open: ['c', 'a'] })
    expect(c.state.get().open).toEqual(['a', 'c'])
    c.update({ panels, open: ['c', 'a'] })
    expect(c.state.get().open).toEqual(['a', 'c'])
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('while pending, the root reports the open state it expects', () => {
    // Uncontrolled: the first panel will open once it registers.
    const free = make({ panels: [], pending: true })
    expect(free.c.rootAttrs()['data-state']).toBe('open')
    free.c.update({ pending: false })
    expect(free.c.rootAttrs()['data-state']).toBe('closed')
    // Controlled closed stays closed.
    const shut = make({ panels: [], open: null, pending: true })
    expect(shut.c.rootAttrs()['data-state']).toBe('closed')
    // Leaving pending publishes, so a binding re-renders the root.
    const seen = vi.fn()
    free.c.update({ pending: true })
    free.c.state.subscribe(seen)
    seen.mockClear()
    free.c.update({ pending: false })
    expect(seen).toHaveBeenCalled()
  })

  it('switching from stack to rail keeps the first expanded panel', () => {
    const { c, onOpenChange } = make({ layout: 'stack', open: ['b', 'c'] })
    c.update({ layout: 'rail' })
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
  })

  it('an uncontrolled sidebar switched to tabs with nothing open opens its first panel', () => {
    // Tabs collapse only through a controlled open, so an uncontrolled one never hides itself.
    const { c, onOpenChange } = make()
    c.toggle('a')
    expect(c.state.get().open).toEqual([])
    c.update({ layout: 'tabs' })
    expect(c.state.get().open).toEqual(['a'])
    expect(onOpenChange).toHaveBeenLastCalledWith('a')
    expect(c.rootAttrs()['data-state']).toBe('open')
  })

  it('rail and tabs triggers are tabs', () => {
    for (const layout of ['rail', 'tabs'] as const) {
      const { c } = make({ layout })
      const n = /^ink-sb-(\d+)-/.exec(c.triggerAttrs('a').id!)?.[1]
      expect(c.triggerAttrs('a')).toMatchObject({
        id: `ink-sb-${n}-trigger-a`,
        role: 'tab',
        'aria-selected': 'true',
        'aria-controls': `ink-sb-${n}-panel-a`,
        'data-ink-sidebar-trigger': 'a',
        tabindex: '0',
      })
      expect(c.triggerAttrs('b')).toMatchObject({
        'aria-selected': 'false',
        tabindex: '-1',
      })
      expect(c.triggerAttrs('a')).not.toHaveProperty('aria-expanded')
      expect(c.tablistAttrs()).toMatchObject({
        role: 'tablist',
        'aria-orientation': layout === 'rail' ? 'vertical' : 'horizontal',
      })
    }
  })

  it('names triggers by label, with a shown badge', () => {
    const { c } = make()
    expect(c.triggerAttrs('a')['aria-label']).toBe('Pages')
    expect(c.triggerAttrs('b')['aria-label']).toBe('Suggestions, 3')
    expect(c.triggerAttrs('a').title).toBe('Pages')
  })

  it('gives each controller its own ids', () => {
    const one = make().c.triggerAttrs('a').id
    const two = make().c.triggerAttrs('a').id
    expect(one).not.toBe(two)
  })

  it('stack triggers are disclosure buttons', () => {
    const { c } = make({ layout: 'stack' })
    const attrs = c.triggerAttrs('a')
    expect(attrs).toMatchObject({
      'aria-expanded': 'true',
      'aria-controls': c.panelAttrs('a').id,
    })
    expect(attrs).not.toHaveProperty('role')
    expect(attrs).not.toHaveProperty('aria-selected')
    expect(attrs).not.toHaveProperty('tabindex')
    expect(c.triggerAttrs('b')['aria-expanded']).toBe('false')
    expect(c.tablistAttrs()).not.toHaveProperty('role')
  })

  it('closed panels are hidden', () => {
    const { c } = make()
    expect(c.panelAttrs('b').hidden).toBe('')
    expect(c.panelAttrs('a')).not.toHaveProperty('hidden')
    expect(c.panelAttrs('a')).toMatchObject({
      role: 'tabpanel',
      'aria-labelledby': c.triggerAttrs('a').id,
    })
    c.update({ layout: 'stack' })
    expect(c.panelAttrs('a').role).not.toBe('tabpanel')
    expect(c.panelAttrs('a')['aria-labelledby']).toBe(c.triggerAttrs('a').id)
  })

  it('publishes layout, side and panels on update', () => {
    const { c } = make()
    const seen = vi.fn()
    c.state.subscribe(seen)
    c.update({ side: 'right', layout: 'tabs' })
    expect(seen).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: 'right', layout: 'tabs', open: ['a'] })
    )
    expect(c.rootAttrs()).toEqual({
      'data-ink-sidebar': '',
      'data-layout': 'tabs',
      'data-side': 'right',
      'data-state': 'open',
    })
    c.update({ open: null })
    expect(c.rootAttrs()['data-state']).toBe('closed')
  })

  it('does not publish an update that changes nothing', () => {
    const { c } = make({ layout: 'stack', open: ['a'] })
    const seen = vi.fn()
    c.state.subscribe(seen)
    c.update({ onOpenChange: vi.fn() })
    c.update({ open: ['a'] })
    c.update({ panels: panels.map((p) => ({ ...p })), layout: 'stack', side: 'left' })
    expect(seen).not.toHaveBeenCalled()
    c.update({ panels: panels.map((p) => (p.id === 'b' ? { ...p, badge: 4 } : p)) })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('a new onOpenChange alone is used without publishing', () => {
    const { c, onOpenChange } = make()
    const next = vi.fn()
    const seen = vi.fn()
    c.state.subscribe(seen)
    c.update({ onOpenChange: next })
    expect(seen).not.toHaveBeenCalled()
    c.toggle('b')
    expect(next).toHaveBeenCalledWith('b')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('takes ids from idPrefix when given', () => {
    const { c } = make({ idPrefix: 'left-bar' })
    expect(c.triggerAttrs('a').id).toBe('left-bar-trigger-a')
    expect(c.panelAttrs('a').id).toBe('left-bar-panel-a')
    expect(c.triggerAttrs('a')['aria-controls']).toBe('left-bar-panel-a')
    expect(c.panelAttrs('a')['aria-labelledby']).toBe('left-bar-trigger-a')
  })

  it('does nothing after destroy', () => {
    const { c, onOpenChange } = make()
    c.destroy()
    c.toggle('b')
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('sidebarBadge', () => {
  it.each([
    [undefined, null],
    ['', null],
    [0, null],
    ['0', null],
    [3, '3'],
    ['new', 'new'],
  ])('%j shows %j', (badge, text) => expect(sidebarBadge(badge)).toBe(text))
})

/** A storage whose calls are spied on, holding `initial`. */
function spyStorage(initial: Record<string, unknown> = {}) {
  const inner = createMemoryStorage(initial)
  return {
    get: vi.fn((key: string) => inner.get(key)),
    set: vi.fn((key: string, value: unknown) => inner.set(key, value)),
    remove: vi.fn((key: string) => inner.remove(key)),
  } satisfies InkStorage
}

/** A storage whose `get` answers when `answer` is called. */
function lateStorage() {
  let answer!: (value: unknown) => void
  const storage = spyStorage()
  storage.get.mockImplementation(
    () => new Promise<unknown>((resolve) => (answer = resolve))
  )
  return { storage, answer: (value: unknown) => answer(value) }
}

/** Enough of a handle element to take the controller's listeners in node. */
function fakeHandle() {
  const listeners = new Map<string, (e: Event) => void>()
  const el = {
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    closest: () => null,
    parentElement: null,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  } as unknown as HTMLElement
  const key = (key: string) =>
    listeners.get('keydown')?.({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      defaultPrevented: false,
      preventDefault: () => {},
    } as unknown as Event)
  const pointer = (type: string, clientX: number) =>
    listeners.get(type)?.({
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX,
      preventDefault: () => {},
    } as unknown as Event)
  return { el, key, pointer, listeners }
}

/**
 * A handle inside a root inside a container, with ResizeObserver stubbed: `to(width)` reports
 * the container at that width.
 */
function observedContainer() {
  const callbacks: ResizeObserverCallback[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect() {}
    }
  )
  const parent = {}
  const root = { parentElement: parent }
  const h = fakeHandle()
  const handle = Object.assign(h.el, { closest: () => root })
  const to = (width: number) => {
    for (const cb of callbacks)
      cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
  }
  return { handle, to }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('sidebar width', () => {
  it('default width is 320', () => {
    const c = createSidebarController({ panels })
    expect(SIDEBAR_WIDTH).toEqual({ default: 320, min: 240, max: 480 })
    expect(c.state.get()).toMatchObject({ width: 320, resizing: false })
    expect(c.rootStyle()).toEqual({ '--ink-sidebar-width': '320px' })
  })

  it('sync storage applies before the controller returns', () => {
    const storage = spyStorage({ 'sidebar.left.width': 400 })
    const c = createSidebarController({ panels, storage })
    expect(storage.get).toHaveBeenCalledWith('sidebar.left.width')
    expect(c.state.get().width).toBe(400)
    expect(c.rootStyle()['--ink-sidebar-width']).toBe('400px')
  })

  it('async storage applies later', async () => {
    const { storage, answer } = lateStorage()
    const c = createSidebarController({ panels, storage })
    expect(c.state.get().width).toBe(320)
    answer(360)
    await flush()
    expect(c.state.get().width).toBe(360)
  })

  it('a late async answer does not overwrite a key move', async () => {
    const { storage, answer } = lateStorage()
    const c = createSidebarController({ panels, storage })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('ArrowRight')
    answer(450)
    await flush()
    expect(c.state.get().width).toBe(336)
  })

  it('a press that does not move saves nothing, and a late answer still applies', async () => {
    const { storage, answer } = lateStorage()
    const c = createSidebarController({ panels, storage })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.pointer('pointerdown', 100)
    h.pointer('pointerup', 100)
    expect(storage.set).not.toHaveBeenCalled()
    answer(400)
    await flush()
    expect(c.state.get().width).toBe(400)
  })

  it('a double-click leaves the key removed', () => {
    const storage = spyStorage({ 'sidebar.left.width': 400 })
    const c = createSidebarController({ panels, storage })
    const h = fakeHandle()
    c.bindHandle(h.el)
    for (let i = 0; i < 2; i++) {
      h.pointer('pointerdown', 100)
      h.pointer('pointerup', 100)
    }
    h.listeners.get('dblclick')?.({} as Event)
    expect(c.state.get().width).toBe(320)
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.get('sidebar.left.width')).toBeUndefined()
  })

  it('a new maxWidth that leaves the shown width alone still updates aria-valuemax', () => {
    const c = createSidebarController({ panels })
    const seen = vi.fn<(max: string | undefined) => void>()
    c.state.subscribe(() => {
      seen(c.handleAttrs()['aria-valuemax'])
    })
    c.update({ maxWidth: 600 })
    expect(c.state.get().width).toBe(320)
    expect(seen).toHaveBeenLastCalledWith('600')
    c.update({ minWidth: 200 })
    expect(c.handleAttrs()['aria-valuemin']).toBe('200')
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it.each(['abc', -5, NaN, null, 0, Infinity])(
    'junk in storage gives the default (%s)',
    (junk) => {
      const storage = spyStorage()
      storage.get.mockReturnValue(junk)
      const c = createSidebarController({ panels, storage })
      expect(c.state.get().width).toBe(320)
    }
  )

  it('a throwing or rejecting storage keeps the default', async () => {
    const throwing = spyStorage()
    throwing.get.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(createSidebarController({ panels, storage: throwing }).state.get().width).toBe(
      320
    )
    const rejecting = spyStorage()
    rejecting.get.mockReturnValue(Promise.reject(new Error('blocked')))
    const c = createSidebarController({ panels, storage: rejecting })
    await flush()
    expect(c.state.get().width).toBe(320)
  })

  it('keys move by 16 and save', () => {
    const storage = spyStorage()
    const onWidthChange = vi.fn()
    const c = createSidebarController({ panels, storage, onWidthChange })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('ArrowRight')
    expect(c.state.get().width).toBe(336)
    expect(storage.set).toHaveBeenLastCalledWith('sidebar.left.width', 336)
    expect(onWidthChange).toHaveBeenLastCalledWith(336)
    h.key('ArrowLeft')
    expect(c.state.get().width).toBe(320)
    expect(storage.set).toHaveBeenLastCalledWith('sidebar.left.width', 320)
  })

  it('right sidebar keys are mirrored', () => {
    const storage = spyStorage()
    const c = createSidebarController({ panels, storage, side: 'right' })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('ArrowLeft')
    expect(c.state.get().width).toBe(336)
    expect(storage.set).toHaveBeenLastCalledWith('sidebar.right.width', 336)
    h.key('ArrowRight')
    h.key('ArrowRight')
    expect(c.state.get().width).toBe(304)
  })

  it('Home and End go to min and max', () => {
    const c = createSidebarController({ panels, minWidth: 200, maxWidth: 600 })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('Home')
    expect(c.state.get().width).toBe(200)
    h.key('ArrowLeft')
    expect(c.state.get().width).toBe(200)
    h.key('End')
    expect(c.state.get().width).toBe(600)
    expect(c.handleAttrs()).toMatchObject({
      'aria-valuemin': '200',
      'aria-valuemax': '600',
      'aria-valuenow': '600',
    })
  })

  it('Enter resets and removes the key', () => {
    const storage = spyStorage({ 'sidebar.left.width': 400 })
    const c = createSidebarController({ panels, storage })
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('Enter')
    expect(c.state.get().width).toBe(320)
    expect(storage.remove).toHaveBeenCalledWith('sidebar.left.width')
    c.update({ defaultWidth: 300 })
    c.resetWidth()
    expect(c.state.get().width).toBe(300)
  })

  it('controlled width only reports and never touches storage', () => {
    const storage = spyStorage({ 'sidebar.left.width': 400 })
    const onWidthChange = vi.fn()
    const c = createSidebarController({ panels, storage, width: 280, onWidthChange })
    expect(c.state.get().width).toBe(280)
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('ArrowRight')
    expect(onWidthChange).toHaveBeenLastCalledWith(296)
    expect(c.state.get().width).toBe(280)
    h.key('Enter')
    expect(onWidthChange).toHaveBeenLastCalledWith(320)
    c.update({ width: 296 })
    expect(c.state.get().width).toBe(296)
    expect(storage.get).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('name sets the key', () => {
    const storage = spyStorage({ 'sidebar.thumbs.width': 260 })
    const c = createSidebarController({ panels, storage, name: 'thumbs' })
    expect(c.state.get().width).toBe(260)
    const h = fakeHandle()
    c.bindHandle(h.el)
    h.key('ArrowRight')
    expect(storage.set).toHaveBeenLastCalledWith('sidebar.thumbs.width', 276)
  })

  it('handle hidden while no rail panel is open', () => {
    const c = createSidebarController({ panels, idPrefix: 'sb' })
    expect(c.handleAttrs()).toEqual({
      'data-ink-sidebar-handle': '',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize left sidebar',
      'aria-controls': 'sb-panels',
      'aria-valuemin': '240',
      'aria-valuemax': '480',
      'aria-valuenow': '320',
      tabindex: '0',
    })
    expect(c.panelsAttrs()).toEqual({ id: 'sb-panels' })
    c.toggle('a')
    expect(c.handleAttrs().hidden).toBe('')
    c.toggle('a')
    c.update({ visible: false })
    expect(c.handleAttrs().hidden).toBe('')
  })

  it('panels id comes from the same base as the other ids', () => {
    const c = createSidebarController({ panels })
    const base = c.panelAttrs('a').id!.replace(/-panel-a$/, '')
    expect(c.panelsAttrs().id).toBe(`${base}-panels`)
    expect(c.handleAttrs()['aria-controls']).toBe(`${base}-panels`)
  })

  it('the handle names no panels element in a stack', () => {
    expect(
      createSidebarController({ panels }).handleAttrs()['aria-controls']
    ).toBeDefined()
    expect(
      createSidebarController({ panels, layout: 'tabs' }).handleAttrs()['aria-controls']
    ).toBeDefined()
    expect(
      createSidebarController({ panels, layout: 'stack' }).handleAttrs()
    ).not.toHaveProperty('aria-controls')
  })

  it('handle label names the side', () => {
    expect(createSidebarController({ panels }).handleAttrs()['aria-label']).toBe(
      'Resize left sidebar'
    )
    expect(
      createSidebarController({ panels, side: 'right' }).handleAttrs()['aria-label']
    ).toBe('Resize right sidebar')
    expect(
      createSidebarController({
        panels,
        side: 'right',
        handleLabel: 'Resize outline',
      }).handleAttrs()['aria-label']
    ).toBe('Resize outline')
  })

  it('aria-valuemax is maxWidth', () => {
    expect(createSidebarController({ panels }).handleAttrs()['aria-valuemax']).toBe('480')
    expect(
      createSidebarController({ panels, maxWidth: 900 }).handleAttrs()['aria-valuemax']
    ).toBe('900')
    // A narrow container changes where the sidebar sits, not how wide it may be.
    const resize = observedContainer()
    const c = createSidebarController({ panels, open: 'a' })
    c.bindHandle(resize.handle)
    resize.to(600)
    expect(c.handleAttrs()['aria-valuemax']).toBe('480')
  })

  it('minDocumentWidth defaults to 480', () => {
    const resize = observedContainer()
    // Open and controlled, so it stays open whatever the first measurement says.
    const c = createSidebarController({ panels, open: 'a' })
    c.bindHandle(resize.handle)
    // 800 leaves the document 480 beside a 320 rail sidebar; 799 does not.
    resize.to(800)
    expect(c.state.get().floating).toBe(false)
    expect(c.rootAttrs()).not.toHaveProperty('data-overlay')
    resize.to(799)
    expect(c.state.get().floating).toBe(true)
    expect(c.rootAttrs()['data-overlay']).toBe('')
    const own = createSidebarController({ panels, open: 'a', minDocumentWidth: 400 })
    const other = observedContainer()
    own.bindHandle(other.handle)
    other.to(799)
    expect(own.state.get().floating).toBe(false)
  })

  it('a minDocumentWidth that is not a finite width falls back to 480', () => {
    for (const minDocumentWidth of [Number.NaN, -1]) {
      const resize = observedContainer()
      const c = createSidebarController({ panels, open: 'a', minDocumentWidth })
      c.bindHandle(resize.handle)
      resize.to(800)
      expect(c.state.get().floating).toBe(false)
      resize.to(799)
      expect(c.state.get().floating).toBe(true)
      c.destroy()
    }
  })
})
