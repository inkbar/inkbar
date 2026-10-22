import { InkError } from '@inkbar/core'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it, vi } from 'vitest'
import { page as browserPage } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, gateFetch, q } from './dom.js'
import CommandStateHarness from './harness/CommandStateHarness.svelte'
import PluginHarness from './harness/PluginHarness.svelte'

const assets = browserAssets()
const guard = guardConsole()

const command = (id: string) => `div.ink-command > button[data-command="${id}"]`
const click = async (selector: string) =>
  browserPage.elementLocator(await q(selector)).click()
const text = (selector: string) => () =>
  document.querySelector(selector)?.textContent?.trim() ?? null
const disabled = (selector: string) => () =>
  document.querySelector<HTMLButtonElement>(selector)?.disabled ?? null
const PROBE = '[data-testid="probe"]'

describe('InkCommand', () => {
  // React: 'InkCommand runs a plugin command and shows its status'
  it('runs a plugin command and shows its status', async () => {
    await render(PluginHarness, { src: fixtureUrl('text-simple'), assets })
    const button = command('sandbox.work')
    const status =
      'div.ink-command:has(> button[data-command="sandbox.work"]) > span.ink-command-status'
    expect((await q(button)).getAttribute('aria-label')).toBe('Work')
    expect(attr(button, 'type')()).toBe('button')
    expect(attr(status, 'role')()).toBe('status')
    await expect.poll(disabled(button)).toBe(false)
    await click(button)
    await expect.poll(attr(button, 'aria-busy')).toBe('true')
    expect(disabled(button)()).toBe(true)
    await expect.poll(text(status)).toBe('Working')
    await click('[data-testid="finish"]')
    await expect.poll(attr(button, 'aria-busy')).toBe('false')
    await expect.poll(disabled(button)).toBe(false)
    await expect.poll(text(status)).toBe('Done')
    // useCommand hands a host the same command.
    expect(attr(PROBE, 'data-accept-label')()).toBe('Accept')
    await expect.poll(attr(PROBE, 'data-accept-enabled')).toBe('true')
  })

  // React: 'InkCommand shows the icon, or the label as text when the command has none'
  it('shows the icon, or the label as text when the command has none', async () => {
    await render(PluginHarness, { src: fixtureUrl('text-simple'), assets })
    const work = await q(command('sandbox.work'))
    expect(work.querySelectorAll('svg.ink-icon')).toHaveLength(1)
    expect(work.textContent?.trim()).toBe('')
    const accept = await q(command('sandbox.accept'))
    expect(accept.querySelectorAll('svg')).toHaveLength(0)
    expect(accept.textContent?.trim()).toBe('Accept')
    await expect
      .element(browserPage.elementLocator(accept))
      .toHaveAccessibleName('Accept')
  })

  // React: 'InkCommand is disabled until a document is ready'
  it('is disabled until a document is ready', async () => {
    const gate = gateFetch('text-simple.pdf')
    try {
      await render(PluginHarness, { src: fixtureUrl('text-simple'), assets })
      const button = command('sandbox.accept')
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('loading')
      expect(disabled(button)()).toBe(true)
      expect(attr(PROBE, 'data-accept-enabled')()).toBe('false')
      gate.release()
      await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
      await expect.poll(disabled(button)).toBe(false)
    } finally {
      gate.restore()
    }
  })
})

describe('InkCommand before the plugins are set up', () => {
  // React: 'InkCommand is disabled until the plugins are set up on mount, then enabled'
  it('is disabled until the plugins are set up on mount, then enabled', async () => {
    await render(CommandStateHarness, { assets, id: 'sandbox.always' })
    const button = command('sandbox.always')
    await expect.poll(disabled(button)).toBe(false)
    expect(attr(button, 'aria-label')()).toBe('Always')
    await expect.poll(text('[data-testid="seen"]')).toBe('false,true')
  })

  // React: 'an id no plugin registered logs UnknownCommand and stays a disabled hidden button'
  it('logs UnknownCommand for an id no plugin registered, and stays a disabled hidden button', async () => {
    await render(CommandStateHarness, {
      assets,
      id: 'sandbox.nope',
      src: fixtureUrl('text-simple'),
    })
    const button = command('sandbox.nope')
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    expect(disabled(button)()).toBe(true)
    expect(attr(button, 'aria-hidden')()).toBe('true')
    expect(attr(button, 'aria-label')()).toBeNull()
    expect(attr(button, 'title')()).toBeNull()
    expect(text(button)()).toBe('')
    // Once per handle (the probe's and the button's), though the document opening re-renders.
    const logged = vi.mocked(console.error).mock.calls.map(([e]) => e)
    expect(logged).toHaveLength(2)
    expect(logged[0]).toBeInstanceOf(InkError)
    expect(logged[0]).toMatchObject({
      code: 'UnknownCommand',
      details: { id: 'sandbox.nope', registered: ['sandbox.always'] },
    })
    expect((logged[0] as InkError).message).toContain('sandbox.always')
    guard.clear()
  })
})

describe('InkToolButton', () => {
  // React: "InkToolButton shows a plugin tool's own label"
  it("shows a plugin tool's own label", async () => {
    await render(PluginHarness, { src: fixtureUrl('text-simple'), assets })
    const button = '[data-ink-tool-button][data-tool="sandbox.stamp"]'
    expect((await q(button)).getAttribute('aria-label')).toBe('Stamp')
    expect(document.querySelectorAll(`${button} svg.ink-icon`)).toHaveLength(1)
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('ready')
    await click(button)
    await expect.poll(attr(button, 'aria-pressed')).toBe('true')
  })
})
