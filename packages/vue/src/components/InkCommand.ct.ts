import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import CommandStateHarness from '../../playwright/harness/CommandStateHarness.vue'
import PluginHarness from '../../playwright/harness/PluginHarness.vue'

const assets = browserAssets()

test('InkCommand runs a plugin command and shows its status', async ({ mount }) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const command = cmp.locator(
    'div.ink-command:has(> button[data-command="sandbox.work"])'
  )
  const button = command.locator('button[data-command="sandbox.work"]')
  const status = command.locator('span.ink-command-status')
  await expect(button).toHaveAttribute('aria-label', 'Work')
  await expect(button).toHaveAttribute('type', 'button')
  await expect(status).toHaveAttribute('role', 'status')
  await expect(button).toBeEnabled()
  await button.click()
  await expect(button).toHaveAttribute('aria-busy', 'true')
  await expect(button).toBeDisabled()
  await expect(status).toHaveText('Working')
  await cmp.getByTestId('finish').click()
  await expect(button).toHaveAttribute('aria-busy', 'false')
  await expect(button).toBeEnabled()
  await expect(status).toHaveText('Done')
  // useCommand hands a host the same command.
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-accept-label', 'Accept')
  await expect(probe).toHaveAttribute('data-accept-enabled', 'true')
})

test('InkCommand shows the icon, or the label as text when the command has none', async ({
  mount,
}) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const work = cmp.locator('button[data-command="sandbox.work"]')
  await expect(work.locator('svg.ink-icon')).toHaveCount(1)
  await expect(work).toHaveText('')
  const accept = cmp.locator('button[data-command="sandbox.accept"]')
  await expect(accept.locator('svg')).toHaveCount(0)
  await expect(accept).toHaveText('Accept')
  await expect(accept).toHaveAccessibleName('Accept')
})

test('InkCommand is disabled until a document is ready', async ({ mount, page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/fixtures/text-simple.pdf', async (route) => {
    await gate
    await route.continue()
  })
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const button = cmp.locator('button[data-command="sandbox.accept"]')
  await expect(cmp).toHaveAttribute('data-state', 'loading')
  await expect(button).toBeDisabled()
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-accept-enabled', 'false')
  release()
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(button).toBeEnabled()
})

test("InkToolButton shows a plugin tool's own label", async ({ mount }) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const button = cmp.locator('[data-ink-tool-button][data-tool="sandbox.stamp"]')
  await expect(button).toHaveAttribute('aria-label', 'Stamp')
  await expect(button.locator('svg.ink-icon')).toHaveCount(1)
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
})

test('InkCommand is disabled until the plugins are set up on mount, then enabled', async ({
  mount,
}) => {
  const cmp = await mount(CommandStateHarness, {
    props: { assets, id: 'sandbox.always' },
  })
  const button = cmp.locator('button[data-command="sandbox.always"]')
  await expect(button).toBeEnabled()
  await expect(button).toHaveAttribute('aria-label', 'Always')
  await expect(cmp.getByTestId('seen')).toHaveText('false,true')
})

test('an id no plugin registered throws UnknownCommand once the plugins are set up', async ({
  mount,
}) => {
  const cmp = await mount(CommandStateHarness, { props: { assets, id: 'sandbox.nope' } })
  await expect(cmp).toHaveAttribute('data-error', 'UnknownCommand')
})
