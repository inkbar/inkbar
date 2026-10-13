import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import PortalProbe from './harness/PortalProbe.svelte'

guardConsole()

const made: HTMLElement[] = []
function box(): HTMLElement {
  const el = document.createElement('section')
  document.body.appendChild(el)
  made.push(el)
  return el
}
afterEach(() => {
  for (const el of made.splice(0)) el.remove()
})

const classes = (el: Element) => [...el.children].map((c) => c.className)

describe('portal', () => {
  it('moves the content into the target and leaves the wrapper behind', async () => {
    const target = box()
    const screen = await render(PortalProbe, { into: target, other: box() })
    expect(classes(target)).toEqual(['first', 'last'])
    const wrapper = screen.getByTestId('wrapper').element()
    expect(wrapper.childNodes.length).toBe(0)
    expect(target.querySelector('[hidden]')).toBeNull()
  })

  it('leaves the content alone when the same target is passed again', async () => {
    const target = box()
    const screen = await render(PortalProbe, { into: target, other: box() })
    const first = target.querySelector('.first')!
    let moves = 0
    const observer = new MutationObserver((records) => (moves += records.length))
    observer.observe(target, { childList: true })
    await screen.getByTestId('tick').click()
    await expect.poll(() => first.textContent).toBe('first 1')
    expect(observer.takeRecords().length + moves).toBe(0)
    observer.disconnect()
    expect(target.querySelector('.first')).toBe(first)
  })

  it('nodes Svelte adds later land in the target, and follow it to a new one', async () => {
    const target = box()
    const other = box()
    const screen = await render(PortalProbe, { into: target, other })
    await screen.getByTestId('late').click()
    await expect.poll(() => classes(target)).toEqual(['first', 'late', 'last'])
    expect(screen.getByTestId('wrapper').element().childNodes.length).toBe(0)

    await screen.getByTestId('swap').click()
    await expect.poll(() => classes(other)).toEqual(['first', 'late', 'last'])
    expect(target.childNodes.length).toBe(0)
  })

  it('takes the content back out of a target that has left the page', async () => {
    const target = box()
    const screen = await render(PortalProbe, { into: target, other: box() })
    await screen.getByTestId('late').click()
    await expect.poll(() => classes(target)).toEqual(['first', 'late', 'last'])
    target.remove()
    await screen.getByTestId('hide').click()
    await expect.poll(() => target.childNodes.length).toBe(0)
    expect(document.querySelector('[data-testid="wrapper"]')).toBeNull()
    expect(document.querySelector('.first, .late, .last')).toBeNull()
  })
})
