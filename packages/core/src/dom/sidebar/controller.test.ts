import { describe, expect, it, vi } from 'vitest'

import { createSidebarController, sidebarBadge } from './controller'

import type { SidebarControllerOptions, SidebarPanelInfo } from './controller'

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

  it('switching from stack to rail keeps the first expanded panel', () => {
    const { c, onOpenChange } = make({ layout: 'stack', open: ['b', 'c'] })
    c.update({ layout: 'rail' })
    expect(c.state.get().open).toEqual(['b'])
    expect(onOpenChange).toHaveBeenLastCalledWith('b')
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
