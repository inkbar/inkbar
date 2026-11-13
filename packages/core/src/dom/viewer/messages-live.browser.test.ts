import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { en } from '../../messages'
import { createSignatureLibrary, type SignatureTemplate } from '../../model/signatures'
import { createOutline } from '../outline/outline'
import { createRecordList } from '../records/list'
import { createSearchResults } from '../records/search-results'
import { createFindBar } from '../search/find-bar'
import { createSidebar } from '../sidebar/sidebar'
import { createSignatureDraft } from '../signature-draft'
import { mountContainer, settle, until } from '../test-utils'
import { createThumbnail } from '../thumbnails/thumbnail'
import { freetextTool, highlightTool, shapeTool, signatureTool } from '../tools'

import {
  createPageCount,
  createSearchButton,
  createToolbar,
  createZoomIn,
  createZoomSelect,
} from './controls'
import { createViewer, type CreateViewerOptions, type Viewer } from './create-viewer'
import { createHighlightMenu } from './highlight-menu'
import { createPasswordDialog } from './password-dialog'
import { createShapeMenu } from './shape-menu'
import { createSignatureMenu } from './signature-menu'
import { createTextStyleMenu } from './text-style-menu'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = `${themeCss}\n.ink-scroll { height: 500px; }`
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function make(
  opts: Partial<CreateViewerOptions> = {},
  name: FixtureName = 'text-simple'
) {
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
    ...opts,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return { host, viewer }
}

async function ready(viewer: Viewer) {
  await until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)
  return { doc: viewer.document.get()!, engine: viewer.engine.get()! }
}

const focusIn = (el: Element | null): boolean =>
  !!el && el.contains(document.activeElement)

describe('labels follow setMessages in place', () => {
  it('relabels an open menu in place', async () => {
    const { viewer } = make({ tools: [highlightTool()] })
    const root = createHighlightMenu(viewer)
    viewer.element.prepend(root)
    await ready(viewer)
    const chevron = root.querySelector<HTMLButtonElement>(
      '[data-ink-highlight-menu-trigger]'
    )!
    chevron.focus()
    chevron.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    )
    const panel = document.querySelector<HTMLElement>('[data-ink-menu="highlight"]')!
    expect(focusIn(panel)).toBe(true)
    viewer.setMessages({ highlight: { menu: 'Surlignages', underline: 'Souligner' } })
    expect(document.querySelector('[data-ink-menu="highlight"]')).toBe(panel)
    expect(panel.isConnected).toBe(true)
    expect(focusIn(panel)).toBe(true)
    expect(panel.getAttribute('aria-label')).toBe('Surlignages')
    const underline = panel.querySelector('[data-key="underline"]')!
    expect(underline.textContent?.trim()).toBe('Souligner')
  })

  it('the find bar keeps its query', async () => {
    const { viewer } = make()
    const bar = createFindBar(viewer)
    viewer.element.querySelector('[data-ink-viewport-root]')!.append(bar)
    const { engine } = await ready(viewer)
    await until(() => !!engine.pages.get(0))
    await engine.pages.get(0)!.textLayer.ready
    viewer.search.open()
    const field = bar.querySelector('input')!
    expect(document.activeElement).toBe(field)
    await userEvent.keyboard('QQ123456C')
    const live = bar.querySelector('[data-ink-find-status]')!
    await until(() => live.textContent === 'Match 1 of 3, page 1')
    viewer.setMessages({
      find: {
        field: 'Rechercher dans le document',
        announce: ({ current, total, page }) =>
          `Résultat ${current} sur ${total}, page ${page}`,
      },
    })
    expect(field.value).toBe('QQ123456C')
    expect(document.activeElement).toBe(field)
    expect(field.getAttribute('aria-label')).toBe('Rechercher dans le document')
    expect(bar.isConnected).toBe(true)
    await userEvent.keyboard('{Enter}')
    await until(() => live.textContent === 'Résultat 2 sur 3, page 2')
  })

  it('the find bar says a same-text step again in new words', async () => {
    const { viewer } = make()
    const bar = createFindBar(viewer)
    viewer.element.querySelector('[data-ink-viewport-root]')!.append(bar)
    const { engine } = await ready(viewer)
    await until(() => !!engine.pages.get(0))
    await engine.pages.get(0)!.textLayer.ready
    viewer.search.open()
    await userEvent.keyboard('Page 1')
    const live = bar.querySelector('[data-ink-find-status]')!
    await until(() => live.textContent === 'Match 1 of 1, page 1')
    viewer.setMessages({
      find: {
        announce: ({ current, total, page }) =>
          `Résultat ${current} sur ${total}, page ${page}`,
      },
    })
    // Quiet on the change itself.
    expect(live.textContent).toBe('Match 1 of 1, page 1')
    // Next on the one result reads the same in the new words, but the region still holds the old.
    await userEvent.keyboard('{Enter}')
    await until(() => live.textContent === 'Résultat 1 sur 1, page 1')
  })

  it('a throwing find.count leaves the find bar working, in English', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cleanup.push(() => warn.mockRestore())
    const { viewer } = make({
      messages: {
        find: {
          count: () => {
            throw new Error('no words')
          },
        },
      },
    })
    const bar = createFindBar(viewer)
    viewer.element.querySelector('[data-ink-viewport-root]')!.append(bar)
    const { engine } = await ready(viewer)
    await until(() => !!engine.pages.get(0))
    await engine.pages.get(0)!.textLayer.ready
    viewer.search.open()
    await userEvent.keyboard('QQ123456C')
    const count = bar.querySelector('[data-ink-find-count]')!
    await until(() => count.textContent === en.find.count({ current: 1, total: 3 }))
    await userEvent.keyboard('{Enter}')
    await until(() => count.textContent === en.find.count({ current: 2, total: 3 }))
    expect(bar.isConnected).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('scroll position survives', async () => {
    const { viewer } = make()
    const { engine } = await ready(viewer)
    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    engine.viewport.scrollToPage(2)
    await until(() => engine.viewport.currentPage.get() === 2)
    const top = scroll.scrollTop
    expect(top).toBeGreaterThan(0)
    viewer.setMessages({ toolbar: { zoom: 'Zoomer' } })
    await settle()
    expect(scroll.scrollTop).toBe(top)
  })

  it('function labels re-run', () => {
    const { viewer } = make()
    let current = 'Pages'
    const { element } = createSidebar({
      panels: [{ id: 'pages', label: () => current }],
      content: { pages: document.createElement('div') },
      layout: 'tabs',
      messages: viewer.messages,
    })
    document.body.append(element)
    cleanup.push(() => element.remove())
    const tab = element.querySelector('[data-ink-sidebar-trigger="pages"]')!
    expect(tab.getAttribute('aria-label')).toBe('Pages')
    current = 'Seiten'
    viewer.setMessages({})
    expect(tab.getAttribute('aria-label')).toBe('Seiten')
    expect(tab.querySelector('.ink-sidebar-label')?.textContent).toBe('Seiten')
  })

  it('emphasis toggles still work in another language', async () => {
    const { viewer } = make({
      tools: [freetextTool()],
      messages: { textStyle: { emphasis: 'Mise en forme', bold: 'Gras' } },
    })
    const trigger = createTextStyleMenu(viewer)
    viewer.element.prepend(trigger)
    const { doc } = await ready(viewer)
    const tb = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 50, y: 500, width: 200, height: 40 },
      contents: 'Hello',
      defaultStyle: { fontFamily: 'Helvetica', fontSize: 12, color: '#000000' },
    })
    doc.annotations.select([tb.id])
    trigger.click()
    const panel = document.querySelector<HTMLElement>('[data-ink-menu="text-style"]')!
    const group = panel.querySelector('[data-ink-emphasis]')!
    expect(group.getAttribute('aria-label')).toBe('Mise en forme')
    const bold = panel.querySelector<HTMLButtonElement>('[aria-label="Gras"]')!
    bold.click()
    expect(bold.getAttribute('aria-pressed')).toBe('true')
    expect(doc.annotations.get(tb.id)).toMatchObject({
      defaultStyle: { fontWeight: 'bold' },
    })
  })

  it('plural counts', async () => {
    const { viewer } = make()
    const results = createSearchResults(viewer)
    document.body.append(results)
    cleanup.push(() => results.remove())
    const { engine } = await ready(viewer)
    await until(() => !!engine.pages.get(0))
    const live = results.querySelector('[data-ink-record-status]')!
    viewer.search.setQuery('Page 2')
    await until(() => live.textContent === en.search.resultCount({ count: 1 }))
    viewer.search.setQuery('QQ123456C')
    await until(() => live.textContent === en.search.resultCount({ count: 3 }))
    expect(live.textContent).toBe('3 results')
    viewer.setMessages({
      search: { resultCount: ({ count }) => `${count} résultats` },
    })
    viewer.search.setQuery('Page 3')
    await until(() => live.textContent === '1 résultats')
  })
})

describe('Task 2 follow-ups', () => {
  it('the open thread popover shows dates in the new locale', async () => {
    const { viewer } = make({ locale: 'en-US' }, 'annotated-notes-threaded')
    const { doc } = await ready(viewer)
    const root = doc.annotations.list
      .get()
      .find((a) => a.type === 'text' && !a.inReplyTo && a.createdAt)!
    viewer.setActivated(root.id)
    const time = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-thread-popover] .ink-thread-time')
    await until(() => time() !== null)
    const when = Date.parse(time()!.getAttribute('datetime')!)
    expect(time()!.textContent).toBe(new Date(when).toLocaleString('en-US'))
    viewer.setLocale('de')
    expect(time()!.textContent).toBe(new Date(when).toLocaleString('de'))
  })

  it("relabels the text box tool's draft editor while it is open", async () => {
    const { viewer } = make({ tools: [freetextTool()] })
    const { engine } = await ready(viewer)
    engine.tools.set('freetext')
    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    const h = engine.viewport.hostFor(0)!.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup'] as const)
      scroll.dispatchEvent(
        new PointerEvent(type, {
          clientX: h.left + 100,
          clientY: h.top + 100,
          bubbles: true,
          pointerId: 1,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        })
      )
    const editor = viewer.element.querySelector<HTMLElement>('[data-ink-editor]')!
    expect(editor.getAttribute('aria-label')).toBe('Text box')
    viewer.setMessages({ annotations: { freetext: 'Zone de texte' } })
    expect(editor.getAttribute('aria-label')).toBe('Zone de texte')
    expect(document.activeElement).toBe(editor)
  })

  it("the shape menu's grid and panel are named from shape.menu", async () => {
    const { viewer } = make({
      tools: [shapeTool()],
      messages: { shape: { menu: 'Formes' } },
    })
    const root = createShapeMenu(viewer)
    viewer.element.prepend(root)
    await ready(viewer)
    root.querySelector<HTMLButtonElement>('[data-ink-shape-menu-trigger]')!.click()
    const panel = document.querySelector<HTMLElement>('[data-ink-menu="shape"]')!
    expect(panel.getAttribute('aria-label')).toBe('Formes')
    expect(panel.querySelector('.ink-shape-grid')!.getAttribute('aria-label')).toBe(
      'Formes'
    )
  })
})

describe('more chrome', () => {
  it('toolbar controls relabel, and a toolbar label can be a function', async () => {
    const { viewer } = make()
    let name = 'Mine'
    const bar = createToolbar({ label: () => name, messages: viewer.messages })
    const plain = createToolbar({ messages: viewer.messages })
    const zoomIn = createZoomIn(viewer)
    const select = createZoomSelect(viewer)
    const count = createPageCount(viewer)
    const find = createSearchButton(viewer)
    bar.append(zoomIn, select, count, find)
    viewer.element.prepend(bar)
    await ready(viewer)
    expect(bar.getAttribute('aria-label')).toBe('Mine')
    expect(plain.getAttribute('aria-label')).toBe('Document tools')
    expect(count.textContent).toBe('of 3')
    name = 'Les miens'
    viewer.setMessages({
      toolbar: {
        label: 'Outils',
        zoomIn: 'Agrandir',
        zoom: 'Zoom',
        fitWidth: 'Pleine largeur',
        pageOf: ({ total }) => `sur ${total}`,
        find: 'Rechercher',
      },
    })
    expect(bar.getAttribute('aria-label')).toBe('Les miens')
    expect(plain.getAttribute('aria-label')).toBe('Outils')
    expect(zoomIn.getAttribute('aria-label')).toBe('Agrandir')
    expect(zoomIn.title).toBe('Agrandir')
    expect(select.querySelector('option[value="fit-width"]')!.textContent).toBe(
      'Pleine largeur'
    )
    expect(count.textContent).toBe('sur 3')
    expect(find.getAttribute('aria-label')).toBe('Rechercher')
  })

  it('outline, record list and thumbnail texts follow messages', async () => {
    const { viewer } = make()
    const outline = createOutline(viewer)
    const list = createRecordList(viewer, { records: 'test.items' })
    const thumb = createThumbnail(viewer, { page: 1 })
    document.body.append(outline, list, thumb)
    cleanup.push(() => [outline, list, thumb].forEach((el) => el.remove()))
    await ready(viewer)
    await until(() => outline.getAttribute('aria-busy') === null)
    const empty = outline.querySelector('.ink-outline-empty')!
    expect(empty.textContent).toBe('This document has no outline')
    expect(list.querySelector('.ink-record-list-empty')!.textContent).toBe(
      'Nothing here yet.'
    )
    expect(thumb.getAttribute('aria-label')).toBe('Page 2')
    viewer.setMessages({
      outline: { empty: 'Pas de signets', label: 'Signets' },
      records: { empty: 'Rien' },
      thumbnails: { page: ({ page }) => `Seite ${page}` },
    })
    expect(empty.textContent).toBe('Pas de signets')
    expect(outline.querySelector('[role="tree"]')!.getAttribute('aria-label')).toBe(
      'Signets'
    )
    expect(list.querySelector('.ink-record-list-empty')!.textContent).toBe('Rien')
    expect(thumb.getAttribute('aria-label')).toBe('Seite 2')
  })

  it('an empty host label stays empty', async () => {
    const { viewer } = make()
    const outline = createOutline(viewer, { emptyText: '' })
    document.body.append(outline)
    cleanup.push(() => outline.remove())
    const bar = createToolbar({ label: '', messages: viewer.messages })
    expect(bar.getAttribute('aria-label')).toBe('')
    await ready(viewer)
    await until(() => outline.getAttribute('aria-busy') === null)
    expect(outline.querySelector('.ink-outline-empty')!.textContent).toBe('')
    viewer.setMessages({
      outline: { empty: 'Pas de signets' },
      toolbar: { label: 'Outils' },
    })
    expect(outline.querySelector('.ink-outline-empty')!.textContent).toBe('')
    expect(bar.getAttribute('aria-label')).toBe('')
  })

  it('the sidebar handle and badges follow messages', () => {
    const { viewer } = make()
    const { element } = createSidebar({
      panels: [{ id: 'a', label: 'Notes', badge: 3 }],
      content: { a: document.createElement('div') },
      layout: 'tabs',
      side: 'right',
      messages: viewer.messages,
    })
    document.body.append(element)
    cleanup.push(() => element.remove())
    const handle = element.querySelector('[data-ink-sidebar-handle]')!
    const tab = element.querySelector('[data-ink-sidebar-trigger="a"]')!
    expect(handle.getAttribute('aria-label')).toBe('Resize right sidebar')
    expect(tab.getAttribute('aria-label')).toBe('Notes, 3')
    viewer.setMessages({
      sidebar: {
        resizeRight: 'Redimensionner',
        tab: ({ label, badge }) => `${label} (${badge})`,
      },
    })
    expect(handle.getAttribute('aria-label')).toBe('Redimensionner')
    expect(tab.getAttribute('aria-label')).toBe('Notes (3)')
  })

  it('the password dialog relabels while open', () => {
    const { viewer } = make()
    const dialog = createPasswordDialog({
      onSubmit: () => undefined,
      onCancel: () => undefined,
      messages: viewer.messages,
    })
    cleanup.push(() => dialog.destroy())
    dialog.open({ incorrect: true })
    const el = document.querySelector<HTMLElement>('[data-ink-password-dialog]')!
    const input = el.querySelector('input')!
    expect(el.querySelector('.ink-dialog-title')!.textContent).toBe('Password required')
    viewer.setMessages({
      password: { dialog: 'Mot de passe requis', incorrect: 'Mot de passe incorrect.' },
    })
    expect(document.querySelector('[data-ink-password-dialog]')).toBe(el)
    expect(document.activeElement).toBe(input)
    expect(el.querySelector('.ink-dialog-title')!.textContent).toBe('Mot de passe requis')
    expect(el.querySelector('.ink-password-error')!.textContent).toBe(
      'Mot de passe incorrect.'
    )
  })

  it('the signature menu and dialog relabel while open', async () => {
    const { viewer } = make({ tools: [signatureTool()] })
    const root = createSignatureMenu(viewer)
    viewer.element.prepend(root)
    await ready(viewer)
    const main = root.querySelector<HTMLButtonElement>('[data-ink-signature-button]')!
    const trigger = root.querySelector<HTMLButtonElement>(
      '[data-ink-signature-menu-trigger]'
    )!
    trigger.click()
    const panel = document.querySelector<HTMLElement>('[data-ink-menu="signature"]')!
    const create = panel.querySelector<HTMLElement>('[data-ink-signature-create]')!
    expect(create.textContent?.trim()).toBe('Create signature')
    viewer.setMessages({
      signature: { sign: 'Signer', menu: 'Signatures enregistrées', create: 'Créer' },
    })
    expect(main.getAttribute('aria-label')).toBe('Signer')
    expect(document.querySelector('[data-ink-menu="signature"]')).toBe(panel)
    expect(panel.getAttribute('aria-label')).toBe('Signatures enregistrées')
    expect(create.textContent?.trim()).toBe('Créer')
    create.click()
    const dialog = document.querySelector<HTMLElement>('[data-ink-signature-dialog]')!
    cleanup.push(() => dialog.remove())
    expect(dialog.querySelector('.ink-dialog-title')!.textContent).toBe(
      'Create signature'
    )
    viewer.setMessages({ signature: { dialog: 'Nouvelle signature', draw: 'Dessin' } })
    expect(document.querySelector('[data-ink-signature-dialog]')).toBe(dialog)
    expect(dialog.querySelector('.ink-dialog-title')!.textContent).toBe(
      'Nouvelle signature'
    )
    expect(dialog.querySelector('[role="tab"][data-key="draw"]')!.textContent).toBe(
      'Dessin'
    )
  })

  it('a signature draft rewrites its error in the new words', async () => {
    const { viewer } = make()
    const draft = createSignatureDraft({ messages: viewer.messages })
    cleanup.push(() => draft.destroy())
    await draft.chooseFile(new Blob(['nope'], { type: 'text/plain' }))
    expect(draft.state.get().imageError).toBe('Choose a PNG or JPEG image.')
    viewer.setMessages({ signature: { imageType: 'Choisissez une image PNG ou JPEG.' } })
    expect(draft.state.get().imageError).toBe('Choisissez une image PNG ou JPEG.')
  })

  it("a signature library's removal error comes from the caller's words", async () => {
    const failing = {
      list: () => Promise.resolve([] as SignatureTemplate[]),
      save: () => Promise.resolve(),
      remove: () => Promise.reject(new Error('no')),
    }
    const library = createSignatureLibrary(failing, {
      removeFailed: () => 'Impossible de supprimer.',
    })
    await library.remove('x').catch(() => undefined)
    expect(library.removeError.get()).toBe('Impossible de supprimer.')
  })
})
