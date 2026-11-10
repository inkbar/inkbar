import { AxeBuilder } from '@axe-core/playwright'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { OutlineHarness as Harness } from '../../playwright/harness/OutlineHarness'

const assets = browserAssets()
guardConsole(test)

const props = { src: fixtureUrl('outline'), assets }

test('outline in a panel navigates and marks current', async ({ mount, page }) => {
  await mount(<Harness {...props} />)
  const tree = page.getByRole('tree', { name: 'Outline' })
  await expect(tree).toBeVisible()
  const item = (name: string) => tree.getByRole('treeitem', { name, exact: true })
  await expect(item('Cover')).toHaveAttribute('aria-current', 'location')
  // "Part One" is closed in the file: its children are not shown until it opens.
  await expect(item('Part One')).toHaveAttribute('aria-expanded', 'false')
  await expect(item('Chapter 1')).toBeHidden()
  await expect(item('Part Two')).toHaveAttribute('aria-expanded', 'true')
  await expect(item('Section A')).toBeVisible()
  await expect(page.getByTestId('outline')).toHaveClass(/ink-outline/)

  // The chevron toggles without following the item: the page stays and Back stays disabled.
  await item('Part One').locator('.ink-outline-toggle').first().click()
  await expect(item('Part One')).toHaveAttribute('aria-expanded', 'true')
  await expect(item('Chapter 1')).toBeVisible()
  await expect(page.getByTestId('current')).toHaveText('0')
  await expect(item('Cover')).toHaveAttribute('aria-current', 'location')
  await expect(page.getByTestId('back')).toBeDisabled()

  // A row click follows the item.
  await item('Part Two').locator('.ink-outline-title').first().click()
  await expect(page.getByTestId('current')).toHaveText('2')
  await expect(item('Part Two')).toHaveAttribute('aria-current', 'location')
  await expect(item('Cover')).not.toHaveAttribute('aria-current')

  const results = await new AxeBuilder({ page }).include('[data-ink-outline]').analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('arrow keys move focus', async ({ mount, page }) => {
  await mount(<Harness {...props} />)
  const tree = page.getByRole('tree', { name: 'Outline' })
  const item = (name: string) => tree.getByRole('treeitem', { name, exact: true })
  await expect(item('Cover')).toHaveAttribute('tabindex', '0')
  await item('Cover').focus()
  await page.keyboard.press('ArrowDown')
  await expect(item('Part One')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(item('Part One')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(item('Chapter 1')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(item('Part One')).toBeFocused()
  await expect(tree.locator('[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('End')
  await expect(item('Broken')).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('current')).toHaveText('0')
})

test('empty text', async ({ mount, page }) => {
  await mount(
    <Harness src={fixtureUrl('text-simple')} assets={assets} emptyText="Nothing here" />
  )
  await expect(page.getByText('Nothing here')).toBeVisible()
  await expect(page.getByRole('treeitem')).toHaveCount(0)
})

test('renderItem replaces the title', async ({ mount, page }) => {
  await mount(<Harness {...props} slotted />)
  const cover = page.getByRole('treeitem', { name: 'Cover', exact: true })
  await expect(cover.locator('.harness-title').first()).toHaveAttribute(
    'data-current',
    'true'
  )
  await expect(
    page
      .getByRole('treeitem', { name: 'Part One', exact: true })
      .locator('.harness-title')
      .first()
  ).toHaveAttribute('data-expanded', 'false')
})

test('Back returns after an outline jump', async ({ mount, page }) => {
  await mount(<Harness {...props} />)
  const back = page.getByTestId('back')
  const forward = page.getByTestId('forward')
  await expect(back).toBeDisabled()
  await expect(forward).toBeDisabled()
  await expect(back).toHaveAttribute('aria-label', 'Back')
  await expect(forward).toHaveAttribute('aria-label', 'Forward')
  await page
    .getByRole('treeitem', { name: 'Part Two', exact: true })
    .locator('.ink-outline-title')
    .first()
    .click()
  await expect(page.getByTestId('current')).toHaveText('2')
  await expect(back).toBeEnabled()
  await back.click()
  await expect(page.getByTestId('current')).toHaveText('0')
  await expect(forward).toBeEnabled()
  await forward.click()
  await expect(page.getByTestId('current')).toHaveText('2')
})

test('a new src shows its own tree and starts with Back disabled', async ({
  mount,
  page,
}) => {
  await mount(<Harness {...props} otherSrc={fixtureUrl('text-simple')} />)
  const tree = page.getByRole('tree', { name: 'Outline' })
  await page
    .getByRole('treeitem', { name: 'Part Two', exact: true })
    .locator('.ink-outline-title')
    .first()
    .click()
  await expect(page.getByTestId('back')).toBeEnabled()

  await page.getByTestId('open-other').click()
  await expect(page.getByText('This document has no outline')).toBeVisible()
  await expect(tree.getByRole('treeitem')).toHaveCount(0)
  await expect(page.getByTestId('back')).toBeDisabled()
  await expect(page.getByTestId('forward')).toBeDisabled()

  await page.getByTestId('open-first').click()
  await expect(
    tree.getByRole('treeitem', { name: 'Cover', exact: true })
  ).toHaveAttribute('aria-current', 'location')
  await expect(page.getByTestId('back')).toBeDisabled()
})
