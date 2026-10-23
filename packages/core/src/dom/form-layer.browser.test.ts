import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'

import { SCRATCH_BUDGET } from './form-appearance'
import { createPageMount, type PageMount } from './page-mount'
import { createPageRenderer } from './page-renderer'
import { mountContainer, nextFrame, openFixtureInBrowser, until } from './test-utils'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'
import { mountViewer } from './viewer-engine'

import type { SignFieldRequest } from './form-layer'
import type { InkDocument } from '../model/document'
import type { FormField, FormWidget } from '../model/form/types'
import type { Rect } from '../model/geometry'
import type { FixtureName } from '@inkbar/fixtures/urls'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
})

function addTheme() {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  cleanup.push(() => style.remove())
}

async function open(name: FixtureName): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

interface MountOptions {
  page?: number
  zoom?: number
  rotation?: ViewRotation
  highlight?: boolean
  active?: () => boolean
  onSignField?: (req: SignFieldRequest) => void
}

/** A page of `doc` mounted through `createPageMount`, inside a themed root. */
function mountPage(doc: InkDocument, o: MountOptions = {}) {
  const index = o.page ?? 0
  let transform = createPageTransform(doc.pages[index]!, o.zoom ?? 1, o.rotation ?? 0)
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  host.dataset.inkRoot = ''
  const mount: PageMount = createPageMount({
    document: doc,
    page: index,
    host,
    transform,
    store: doc.annotations,
    devicePixelRatio: 1,
    ...(o.highlight === undefined ? {} : { formHighlight: o.highlight }),
    ...(o.active ? { formActive: o.active } : {}),
    ...(o.onSignField ? { onSignField: o.onSignField } : {}),
  })
  cleanup.push(() => {
    mount.destroy()
    host.remove()
  })
  const widgetOf = (name: string): FormWidget =>
    doc.form.fields
      .get()
      .find((f) => f.name === name)!
      .widgets.find((w) => w.page === index)!
  const box = (name: string) =>
    host.querySelector<HTMLElement>(`[data-ink-widget="${widgetOf(name).id}"]`)!
  const control = (name: string) =>
    box(name).querySelector<HTMLInputElement & HTMLTextAreaElement>('input, textarea')!
  return {
    host,
    mount,
    widgetOf,
    box,
    control,
    get transform() {
      return transform
    },
    update(next: PageTransform) {
      transform = next
      mount.update(next)
    },
  }
}

/** `el`'s border box relative to `host`, in CSS px. */
function boxIn(el: Element, host: HTMLElement) {
  const r = el.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  return { left: r.left - h.left, top: r.top - h.top, width: r.width, height: r.height }
}

function expectBox(
  actual: ReturnType<typeof boxIn>,
  expected: { left: number; top: number; width: number; height: number }
) {
  expect(Math.abs(actual.left - expected.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.top - expected.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1)
}

/** Focuses `el` and types `text` over its whole content. */
async function typeOver(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  await userEvent.click(el)
  el.select()
  await userEvent.keyboard(text)
}

const TEXT_FIELDS_PAGE_0 = [
  'name',
  'notes',
  'pin',
  'code',
  'auto',
  'locked',
  'email',
  'internal',
  'header.ref',
  'styled',
]

describe('form layer', () => {
  it('renders one input per text widget, positioned over the widget rect', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const layer = p.host.querySelector('div.ink-form-layer[data-ink-form-layer]')
    expect(layer).not.toBeNull()
    expect(p.mount.form).toBeDefined()
    expect(
      layer!.querySelectorAll('[data-ink-type="text"] :is(input, textarea)')
    ).toHaveLength(TEXT_FIELDS_PAGE_0.length)
    for (const name of TEXT_FIELDS_PAGE_0) {
      const w = p.widgetOf(name)
      expect(p.box(name).dataset.inkField).toBe(name)
      expectBox(boxIn(p.control(name), p.host), p.transform.toCssRect(w.rect))
    }
    expect(p.control('name').autocomplete).toBe('off')
  })

  it('typing then blurring commits once', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const input = p.control('name')
    await typeOver(input, 'Ada')
    expect(doc.form.get('name')).toBe('Sam')
    input.blur()
    expect(doc.form.get('name')).toBe('Ada')
    expect(doc.history.canUndo.get()).toBe(true)
    doc.history.undo()
    expect(doc.form.get('name')).toBe('Sam')
    expect(doc.history.canUndo.get()).toBe(false)
    expect(input.value).toBe('Sam')
  })

  it('Enter commits a single-line field and keeps a newline in a multiline one', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const name = p.control('name')
    await typeOver(name, 'Bo{Enter}')
    expect(doc.form.get('name')).toBe('Bo')
    expect(document.activeElement).toBe(name)

    const notes = p.control('notes')
    expect(notes.tagName).toBe('TEXTAREA')
    await typeOver(notes, 'a{Enter}b')
    expect(notes.value).toBe('a\nb')
    expect(doc.form.get('notes')).toBe('')
    notes.blur()
    expect(doc.form.get('notes')).toBe('a\nb')
  })

  it('password, max length and comb', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const pin = p.control('pin')
    expect(pin.type).toBe('password')
    expect(pin.maxLength).toBe(4)
    expect(p.box('code').dataset.inkComb).toBe('6')
    expect(p.control('code').maxLength).toBe(6)
  })

  it('auto size shrinks text to fit', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const auto = p.control('auto')
    await userEvent.click(auto)
    const start = parseFloat(getComputedStyle(auto).fontSize)
    expect(start).toBeGreaterThan(0)
    await userEvent.keyboard('The quick brown fox jumps over the lazy dog, twice over')
    const size = parseFloat(getComputedStyle(auto).fontSize)
    expect(size).toBeLessThan(start)
    expect(auto.scrollWidth).toBeLessThanOrEqual(auto.clientWidth + 1)
  })

  it('applies /DA font, colour and alignment', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const name = getComputedStyle(p.control('name'))
    expect(name.fontFamily).toContain('Helvetica')
    expect(name.color).toBe('rgb(0, 0, 0)')
    expect(parseFloat(name.fontSize)).toBeCloseTo(12, 1)
    expect(getComputedStyle(p.control('notes')).textAlign).toBe('center')
    const styled = getComputedStyle(p.control('styled'))
    expect(styled.fontFamily).toContain('Times')
    expect(styled.fontWeight).toBe('700')
    expect(styled.color).toBe('rgb(0, 0, 255)')
  })

  it('the two widgets of one field stay in step', async () => {
    const doc = await open('form-fields')
    const p0 = mountPage(doc, { page: 0 })
    const p1 = mountPage(doc, { page: 1 })
    expect(p1.control('header.ref').value).toBe('REF-0042')
    await typeOver(p0.control('header.ref'), 'REF-7')
    expect(p1.control('header.ref').value).toBe('REF-0042')
    p0.control('header.ref').blur()
    expect(p1.control('header.ref').value).toBe('REF-7')
  })

  it('read-only and required', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const locked = p.control('locked')
    expect(locked.readOnly).toBe(true)
    expect(locked.getAttribute('aria-readonly')).toBe('true')
    expect(p.box('locked').hasAttribute('data-ink-readonly')).toBe(true)
    const email = p.control('email')
    expect(email.getAttribute('aria-required')).toBe('true')
    expect(p.box('email').hasAttribute('data-ink-required')).toBe(true)
    expect(p.control('name').hasAttribute('aria-required')).toBe(false)
    await typeOver(locked, 'changed')
    locked.blur()
    expect(doc.form.get('locked')).toBe('fixed')
  })

  it('labels come from /TU, else the last name part', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    expect(p.control('email').getAttribute('aria-label')).toBe('Email address')
    expect(p.control('header.ref').getAttribute('aria-label')).toBe('ref')
    expect(p.control('name').getAttribute('aria-label')).toBe('name')
  })

  it('shows the formatted value at rest and the raw value while focused', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    const price = p.control('price')
    await typeOver(price, '5')
    price.blur()
    expect(doc.form.get('price')).toBe('5')
    expect(price.value).toBe('£5.00')
    await userEvent.click(price)
    expect(price.value).toBe('5')
    price.blur()
    expect(price.value).toBe('£5.00')
  })

  it('shows a committed date as typed when focused again', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    const when = p.control('when')
    await typeOver(when, '25/12/2026')
    when.blur()
    expect(doc.form.get('when')).toBe('25/12/2026')
    expect(when.value).toBe('25/12/2026')
    await userEvent.click(when)
    expect(when.value).toBe('25/12/2026')
  })

  it('refuses keystrokes a script rejects', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    const qty = p.control('qty')
    await userEvent.click(qty)
    await userEvent.keyboard('a')
    expect(qty.value).toBe('')
    await userEvent.keyboard('4')
    expect(qty.value).toBe('4')
    qty.blur()
    expect(doc.form.get('qty')).toBe('4')
  })

  it('hides a widget’s appearance while a script hides the widget', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    await settled(p)
    const id = p.widgetOf('name').id
    expect(shownCanvas(p.host, id)).toBeDefined()
    doc.form._setWidgetState(id, { hidden: true })
    expect(shownCanvas(p.host, id)).toBeUndefined()
    doc.form._setWidgetState(id, { hidden: false })
    expect(shownCanvas(p.host, id)).toBeDefined()
  })

  it('applies script-driven widget state', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const id = p.widgetOf('name').id
    doc.form._setWidgetState(id, { readOnly: true, required: true, textColor: '#ff0000' })
    const input = p.control('name')
    expect(input.readOnly).toBe(true)
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(getComputedStyle(input).color).toBe('rgb(255, 0, 0)')
    expect(p.box('name').hasAttribute('data-ink-drawn')).toBe(true)
    doc.form._setWidgetState(id, { hidden: true })
    expect(getComputedStyle(p.box('name')).display).toBe('none')
  })

  it('keeps caret, draft and position across zoom and rotation', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const notes = p.control('notes')
    await typeOver(notes, 'draft')
    notes.setSelectionRange(1, 3)
    const next = createPageTransform(doc.pages[0]!, 2, 90)
    p.update(next)
    expect(p.control('notes')).toBe(notes)
    expect(document.activeElement).toBe(notes)
    expect(notes.value).toBe('draft')
    expect([notes.selectionStart, notes.selectionEnd]).toEqual([1, 3])
    expect(doc.form.get('notes')).toBe('')
    expectBox(boxIn(notes, p.host), next.toCssRect(p.widgetOf('notes').rect))
    notes.blur()
    expect(doc.form.get('notes')).toBe('draft')
  })

  it('rotated page and /MK /R', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc, { page: 1 })
    const w = p.widgetOf('rotated')
    expect(w.rotation).toBe(90)
    const input = p.control('rotated')
    const css = p.transform.toCssRect(w.rect)
    expectBox(boxIn(input, p.host), css)
    // The page turns 90 clockwise and /MK /R turns the widget back: the text is upright.
    expect(input.offsetWidth).toBeCloseTo(css.width, 0)
    expect(input.offsetHeight).toBeCloseTo(css.height, 0)

    // On an upright view of the same page, the text runs up the box.
    p.update(createPageTransform(doc.pages[1]!, 1, 270))
    const turned = p.transform.toCssRect(w.rect)
    expectBox(boxIn(input, p.host), turned)
    expect(input.offsetWidth).toBeCloseTo(turned.height, 0)
  })

  it('no form layer and ENABLE mode for a PDF without fields', async () => {
    const doc = await open('text-simple')
    const page = await doc._pdfjs.getPage(0)
    const modes: unknown[] = []
    const render = page.render.bind(page)
    vi.spyOn(page, 'render').mockImplementation((params) => {
      modes.push(params.annotationMode)
      return render(params)
    })
    const p = mountPage(doc)
    await p.mount.renderer.rendered
    expect(p.mount.form).toBeUndefined()
    expect(p.host.querySelector('[data-ink-form-layer]')).toBeNull()
    expect(modes).toEqual([doc._pdfjs.module.AnnotationMode.ENABLE])
  })

  it('renders a form page once, into one canvas, and each widget’s appearance apart', async () => {
    const doc = await open('form-fields')
    const renders = await watchRenders(doc)
    const p = mountPage(doc)
    await settled(p)
    expect(p.host.querySelectorAll('[data-ink-canvas]')).toHaveLength(1)
    expect(renders.page()).toBe(1)
    // Every shown widget has its own appearance, drawn over its rect only.
    const shown = widgetsOf(doc, 'name')[0]!
    const canvas = shownCanvas(p.host, shown.id)!
    const css = p.transform.toCssRect(shown.rect)
    expect(canvas.width).toBeLessThanOrEqual(Math.ceil(css.width) + 3)
    expect(canvas.height).toBeLessThanOrEqual(Math.ceil(css.height) + 3)
    expect(canvas.hasAttribute('data-ink-canvas')).toBe(false)
  })

  it('draws a page’s widget appearances in a few batched renders, whatever their number', async () => {
    const doc = await open('form-fields')
    const renders = await watchRenders(doc)
    const p = mountPage(doc)
    await settled(p)
    // The page canvas, then one pass each for the widgets' own appearances and a toggle's
    // checked and unchecked ones: 19 widgets, 4 renders.
    expect(widgetsOnPage(doc, 0).length).toBeGreaterThan(10)
    expect(renders.all()).toBeLessThanOrEqual(4)
    // A new zoom draws them again in as few.
    p.update(createPageTransform(doc.pages[0]!, 1.5, 0))
    await settled(p)
    expect(renders.all()).toBeLessThanOrEqual(8)
  })

  it('hides an appearance drawn at another rotation until its new one lands', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    await settled(p)
    const id = p.widgetOf('name').id
    expect(shownCanvas(p.host, id)).toBeDefined()
    p.update(createPageTransform(doc.pages[0]!, 1, 90))
    expect(shownCanvas(p.host, id)).toBeUndefined()
    await settled(p)
    expect(shownCanvas(p.host, id)).toBeDefined()
    // A zoom keeps the old bitmap, stretched to the new rect, until the new one lands.
    p.update(createPageTransform(doc.pages[0]!, 2, 90))
    const stretched = shownCanvas(p.host, id)!
    const css = p.transform.toCssRect(p.widgetOf('name').rect)
    expect(Math.abs(parseFloat(stretched.style.width) - css.width)).toBeLessThanOrEqual(3)
  })

  it('drops a draw for a geometry that changed before it landed', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const id = p.widgetOf('name').id
    // The first draw is under way; the field is focused, so it no longer shows, and the zoom
    // changes.
    p.control('name').focus()
    p.update(createPageTransform(doc.pages[0]!, 2, 0))
    await settled(p)
    p.control('name').blur()
    // Shown again: nothing at the old zoom's place, only the new draw once it lands.
    const early = shownCanvas(p.host, id)
    const css = p.transform.toCssRect(p.widgetOf('name').rect)
    if (early)
      expect(Math.abs(parseFloat(early.style.width) - css.width)).toBeLessThanOrEqual(3)
    await settled(p)
    const late = shownCanvas(p.host, id)!
    expect(Math.abs(parseFloat(late.style.width) - css.width)).toBeLessThanOrEqual(3)
  })

  it('does not report widgets the file draws nothing for', async () => {
    const doc = await open('form-bare-appearances')
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(t.cssWidth, t.cssHeight)
    const onError = vi.fn()
    const mount = createPageMount({
      document: doc,
      page: 0,
      host,
      transform: t,
      store: doc.annotations,
      devicePixelRatio: 1,
      onError,
    })
    cleanup.push(() => (mount.destroy(), host.remove()))
    await mount.renderer.rendered
    await mount.form!.rendered
    // The checkbox off has no /Off look, and the text field no /AP: PDF.js has no run for
    // either. Checking the box draws its on look.
    const agree = doc.form.fields.get().find((f) => f.name === 'agree')!.widgets[0]!
    await userEvent.click(controlOf(host, agree))
    await mount.form!.rendered
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(onError).not.toHaveBeenCalled()
    expect(shownCanvas(host, agree.id)?.dataset.inkLook).toBe('checked')
  })

  it('keeps each scratch canvas under its budget, one at a time, at high zoom', async () => {
    const doc = await open('form-fields')
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    const areas: number[] = []
    let live = 0
    let most = 0
    vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = render(params)
      if (params.canvas?.hasAttribute('data-ink-canvas')) return task
      areas.push(params.canvas!.width * params.canvas!.height)
      most = Math.max(most, ++live)
      task.promise.then(
        () => live--,
        () => live--
      )
      return task
    })
    // At zoom 6 the page is 3672 by 4752 device px, 17M: its widgets span more than 4M.
    const p = mountPage(doc, { zoom: 6 })
    await settled(p)
    expect(areas.length).toBeGreaterThan(3)
    for (const area of areas) expect(area).toBeLessThanOrEqual(SCRATCH_BUDGET)
    expect(most).toBe(1)
    expect(shownCanvas(p.host, p.widgetOf('notes').id)).toBeDefined()
  })

  it('settles once the shown looks land, without waiting for idle work', async () => {
    // The browser never goes idle.
    vi.spyOn(window, 'requestIdleCallback').mockImplementation(() => 0)
    const doc = await open('form-fields')
    const p = mountPage(doc)
    await p.mount.renderer.rendered
    const settledInTime = await Promise.race([
      p.mount.form!.rendered.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ])
    expect(settledInTime).toBe(true)
    expect(shownCanvas(p.host, p.widgetOf('name').id)).toBeDefined()
  })

  it('touching widgets share a pass', async () => {
    const doc = await open('form-fields')
    const name = widgetsOf(doc, 'name')[0]!
    // pin sits right under name, edge to edge, as table cells do.
    const moved = doc.form.fields.get().map((f): FormField =>
      f.name === 'pin'
        ? {
            ...f,
            widgets: f.widgets.map((w) => ({
              ...w,
              rect: { ...w.rect, x: name.rect.x, y: name.rect.y - w.rect.height },
            })),
          }
        : f
    )
    doc.form._load(moved, doc.form._tabs)
    const renders = await watchRenders(doc)
    const p = mountPage(doc)
    await settled(p)
    expect(renders.all()).toBeLessThanOrEqual(4)
  })

  it('draws a look again after its pass fails', async () => {
    const doc = await open('form-fields')
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    let failures = 0
    vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = render(params)
      if (params.canvas?.hasAttribute('data-ink-canvas') || failures > 0) return task
      failures++
      task.promise.catch(() => undefined)
      task.cancel()
      return {
        promise: Promise.reject(new Error('broken')),
        cancel: () => undefined,
      } as unknown as typeof task
    })
    const p = mountPage(doc)
    await until(() => shownCanvas(p.host, p.widgetOf('name').id) !== undefined, 5_000)
    expect(failures).toBe(1)
  })

  it('reports a page whose widget appearances it cannot find', async () => {
    const doc = await open('form-fields')
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    // Every widget pass finds nothing, as if PDF.js laid out its operator list differently.
    vi.spyOn(page, 'render').mockImplementation((params) => {
      if (params.canvas?.hasAttribute('data-ink-canvas')) return render(params)
      return render({ ...params, operationsFilter: () => false })
    })
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(t.cssWidth, t.cssHeight)
    const onError = vi.fn()
    const mount = createPageMount({
      document: doc,
      page: 0,
      host,
      transform: t,
      store: doc.annotations,
      devicePixelRatio: 1,
      onError,
    })
    cleanup.push(() => (mount.destroy(), host.remove()))
    await until(() => onError.mock.calls.length > 0)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'form')
  })

  it('a toggle or an edit paints nothing', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    await settled(p)
    const renders = await watchRenders(doc)
    const agree = controlOf(p.host, widgetsOf(doc, 'agree')[0]!)
    await userEvent.click(agree)
    await userEvent.click(controlOf(p.host, widgetsOf(doc, 'plan')[1]!))
    await typeOver(p.control('name'), 'Alex')
    p.control('name').blur()
    expect(doc.form.get('agree')).toBe('Yes')
    expect(doc.form.get('name')).toBe('Alex')
    await settled(p)
    expect(renders.all()).toBe(0)
    // Undo shows the file's appearance again, without painting either.
    doc.history.undo()
    await settled(p)
    expect(shownCanvas(p.host, widgetsOf(doc, 'name')[0]!.id)).toBeDefined()
    expect(renders.all()).toBe(0)
  })

  it('inactive while an annotation tool is active', async () => {
    const doc = await open('form-fields')
    const container = mountContainer(800, 600)
    container.style.overflow = 'auto'
    const engine = mountViewer({ container, document: doc, zoom: 1, tool: 'draw' })
    cleanup.push(() => (engine.destroy(), container.remove()))
    await until(() => container.querySelector('[data-ink-field="name"] input') !== null)
    const input = container.querySelector<HTMLInputElement>(
      '[data-ink-field="name"] input'
    )!
    await userEvent.click(input, { force: true })
    expect(document.activeElement).not.toBe(input)
    expect(input.tabIndex).toBe(-1)
    engine.tools.set('select-text')
    expect(input.tabIndex).toBe(0)
    // The press drew a dot at the field's centre, which now takes presses on its own shape.
    await userEvent.click(input, { position: { x: 4, y: 4 } })
    expect(document.activeElement).toBe(input)
  })

  it('formHighlight false removes the tint', async () => {
    addTheme()
    const doc = await open('form-fields')
    const on = mountPage(doc)
    expect(getComputedStyle(on.control('name')).boxShadow).not.toBe('none')
    const off = mountPage(doc, { highlight: false })
    expect(
      off.host
        .querySelector('[data-ink-form-layer]')!
        .getAttribute('data-ink-form-highlight')
    ).toBe('off')
    expect(getComputedStyle(off.control('name')).boxShadow).toBe('none')
  })

  it('an empty signature field asks to be signed; a signed one does not', async () => {
    const doc = await open('form-fields')
    const requests: SignFieldRequest[] = []
    const p = mountPage(doc, { onSignField: (req) => requests.push(req) })
    const box = p.box('sig')
    const button = box.querySelector<HTMLButtonElement>('button')!
    expect(button.textContent).toBe('Sign')
    expect(button.title).toBe('Sign this field')
    expect(button.tabIndex).toBe(0)
    button.click()
    const widget = p.widgetOf('sig')
    expect(requests).toEqual([
      { field: 'sig', widget: widget.id, page: 0, rect: widget.rect, anchor: box },
    ])
    doc.annotations.add({ id: 'ink-1', type: 'square', page: 0, rect: widget.rect })
    doc.form._signWith('sig', 'ink-1')
    expect(button.textContent).toBe('')
    expect(button.hasAttribute('data-ink-signed')).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.tabIndex).toBe(-1)
    expect(p.mount.form!.tabStops()).not.toContain(button)
    button.click()
    expect(requests).toHaveLength(1)
    // The PDF's own appearance of the box stays under the button.
    expect(box.hasAttribute('data-ink-drawn')).toBe(false)
  })

  it('focuses a widget a script moves focus to', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    expect(p.mount.form!.focusWidget(p.widgetOf('email').id)).toBe(true)
    expect(document.activeElement).toBe(p.control('email'))
    doc.form._focus(p.widgetOf('name').id)
    expect(document.activeElement).toBe(p.control('name'))
    expect(p.mount.form!.focusWidget('nope')).toBe(false)
  })

  it('sends the page its open and close events', async () => {
    const doc = await open('form-fields')
    const spy = vi.spyOn(doc.form, '_pageEvent')
    const p = mountPage(doc)
    expect(spy).toHaveBeenCalledWith(0, 'PageOpen')
    p.mount.destroy()
    expect(spy).toHaveBeenCalledWith(0, 'PageClose')
  })

  it('stacks the widget appearances above the page canvas, under text and annotations', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const appearance = p.host.querySelector('[data-ink-form-appearance]')!
    expect(appearance.parentElement).toBe(p.host)
    expect(appearance.previousElementSibling?.hasAttribute('data-ink-canvas-layer')).toBe(
      true
    )
    expect(appearance.nextElementSibling?.hasAttribute('data-ink-text-layer')).toBe(true)
    expect(
      p.host.querySelector('[data-ink-form-layer] [data-ink-form-appearance]')
    ).toBeNull()
  })

  it('reports an appearance canvas that fails to render as a form layer error', async () => {
    const doc = await open('form-fields')
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = render(params)
      // Only the widget appearances fail, not the page canvas.
      if (params.canvas?.hasAttribute('data-ink-canvas')) return task
      task.promise.catch(() => undefined)
      task.cancel()
      return {
        promise: Promise.reject(new Error('broken')),
        cancel: () => undefined,
      } as unknown as typeof task
    })
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(t.cssWidth, t.cssHeight)
    const onError = vi.fn()
    const mount = createPageMount({
      document: doc,
      page: 0,
      host,
      transform: t,
      store: doc.annotations,
      devicePixelRatio: 1,
      onError,
    })
    cleanup.push(() => (mount.destroy(), host.remove()))
    await until(() => onError.mock.calls.length > 0)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'form')
    expect(onError.mock.calls.every(([, layer]) => layer === 'form')).toBe(true)
  })

  it('clears a refused value’s mark once the value changes', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    const age = p.control('age')
    const refuse = async () => {
      await typeOver(age, '5')
      age.blur()
      expect(p.box('age').hasAttribute('data-ink-invalid')).toBe(true)
      expect(age.getAttribute('aria-invalid')).toBe('true')
    }
    await refuse()
    doc.form.set({ age: '40' })
    expect(p.box('age').hasAttribute('data-ink-invalid')).toBe(false)
    expect(age.hasAttribute('aria-invalid')).toBe(false)
    await refuse()
    doc.form.reset(['age'])
    expect(doc.form.get('age')).toBe('')
    expect(p.box('age').hasAttribute('data-ink-invalid')).toBe(false)
  })

  it('an untouched field matches the PDF’s own appearance', async () => {
    // The theme keeps the text layer's glyphs clear, as on any real page.
    addTheme()
    const doc = await open('form-fields')
    const p = mountPage(doc, { highlight: false })
    await settled(p)
    const rect = p.transform.toCssRect(p.widgetOf('name').rect)

    // The same page drawn by PDF.js with every widget's appearance, and with none.
    const reference = (drawWidgets: boolean) => {
      const host = mountContainer(p.transform.cssWidth, p.transform.cssHeight)
      const r = createPageRenderer({
        document: doc,
        page: 0,
        host,
        transform: p.transform,
        devicePixelRatio: 1,
        drawWidgets,
      })
      cleanup.push(() => (r.destroy(), host.remove()))
      return { host, r }
    }
    const pdf = reference(true)
    const bare = reference(false)
    await Promise.all([pdf.r.rendered, bare.r.rendered])

    const shot = async (host: HTMLElement) => {
      const probe = document.createElement('div')
      probe.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;`
      host.append(probe)
      host.scrollIntoView()
      const base64 = await browserPage.screenshot({
        element: probe,
        base64: true,
        save: false,
      })
      probe.remove()
      const img = new Image()
      img.src = `data:image/png;base64,${base64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, c.width, c.height)
    }
    const expected = await shot(pdf.host)
    const layered = await shot(p.host)
    const without = await shot(bare.host)
    expect(differing(layered, expected)).toBeLessThanOrEqual(0.02)
    // The check can fail: the page without the widget's appearance differs.
    expect(differing(without, expected)).toBeGreaterThan(0.02)
  })

  it.each([
    [1.5, 0],
    [1, 90],
  ] as const)(
    'an untouched field still matches at zoom %s and view rotation %i',
    async (zoom, rotation: ViewRotation) => {
      addTheme()
      const doc = await open('form-fields')
      const p = mountPage(doc, { highlight: false })
      await settled(p)
      const t = createPageTransform(doc.pages[0]!, zoom, rotation)
      // The viewer sizes the page host to the page; so does the test.
      p.host.style.width = `${t.cssWidth}px`
      p.host.style.height = `${t.cssHeight}px`
      p.update(t)
      await settled(p)
      const pdf = await reference(doc, t, true)
      for (const name of ['name', 'agree']) {
        const rect = p.widgetOf(name).rect
        expect(
          differing(await shot(p.host, t, rect), await shot(pdf, t, rect))
        ).toBeLessThanOrEqual(0.02)
      }
    }
  )

  it('keeps an annotation over an untouched field visible', async () => {
    addTheme()
    const doc = await open('form-fields')
    const p = mountPage(doc, { highlight: false })
    const w = p.widgetOf('name')
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: w.rect.x + 40, y: w.rect.y + 4, width: 60, height: w.rect.height - 8 },
      color: '#ff0000',
      interiorColor: '#ff0000',
    })
    await settled(p)
    const rect = p.transform.toCssRect(w.rect)
    const probe = document.createElement('div')
    probe.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;`
    p.host.append(probe)
    p.host.scrollIntoView()
    const base64 = await browserPage.screenshot({
      element: probe,
      base64: true,
      save: false,
    })
    probe.remove()
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let red = 0
    for (let i = 0; i < d.length; i += 4)
      if (d[i]! > 200 && d[i + 1]! < 80 && d[i + 2]! < 80) red++
    // Most of the 60 by 14 pt square shows.
    expect(red).toBeGreaterThan(60 * 14 * 0.8)
  })
})

/** Every widget on `page`. */
function widgetsOnPage(doc: InkDocument, page: number): FormWidget[] {
  return doc.form.fields.get().flatMap((f) => f.widgets.filter((w) => w.page === page))
}

/** Every widget of `name` on `page`, in the order the field lists them. */
function widgetsOf(doc: InkDocument, name: string, page = 0): FormWidget[] {
  return doc.form.fields
    .get()
    .find((f) => f.name === name)!
    .widgets.filter((w) => w.page === page)
}

/** The control of one widget in `root`. */
function controlOf<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  w: FormWidget
): T {
  return root.querySelector<T>(`[data-ink-widget="${w.id}"] .ink-form-control`)!
}

/** Counts `page`'s renders from now on: all of them, and those of the whole page canvas. */
async function watchRenders(doc: InkDocument, page = 0) {
  const pdfPage = await doc._pdfjs.getPage(page)
  let all = 0
  let whole = 0
  const render = pdfPage.render.bind(pdfPage)
  vi.spyOn(pdfPage, 'render').mockImplementation((params) => {
    all++
    if (params.canvas?.hasAttribute('data-ink-canvas')) whole++
    return render(params)
  })
  return { all: () => all, page: () => whole }
}

/** Waits for a mounted page's canvas and widget appearances to paint. */
async function settled(p: { mount: PageMount }) {
  await p.mount.renderer.rendered
  await p.mount.form!.rendered
  await nextFrame()
}

/** The widget's appearance canvas showing now, if any. */
function shownCanvas(host: HTMLElement, id: string): HTMLCanvasElement | undefined {
  return [
    ...host.querySelectorAll<HTMLCanvasElement>(`[data-ink-appearance="${id}"] canvas`),
  ].find((c) => c.style.display !== 'none')
}

/** A page of `doc` drawn by PDF.js alone, to compare the layer with. */
async function reference(
  doc: InkDocument,
  transform: PageTransform,
  drawWidgets: boolean
) {
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  const r = createPageRenderer({
    document: doc,
    page: transform.page.index,
    host,
    transform,
    devicePixelRatio: 1,
    drawWidgets,
  })
  cleanup.push(() => (r.destroy(), host.remove()))
  await r.rendered
  return host
}

/**
 * A page of `doc` drawn by PDF.js alone, each checkbox or radio in `states` on or off, as
 * PDF.js draws a form's stored states.
 */
async function storedReference(
  doc: InkDocument,
  transform: PageTransform,
  states: [string, boolean][]
) {
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  cleanup.push(() => host.remove())
  for (const [id, on] of states)
    doc._pdfjs.proxy.annotationStorage.setValue(id, { value: on })
  const pdfPage = await doc._pdfjs.getPage(transform.page.index)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(transform.cssWidth)
  canvas.height = Math.round(transform.cssHeight)
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${transform.cssWidth}px;height:${transform.cssHeight}px;`
  await pdfPage.render({
    canvas,
    viewport: pdfPage.getViewport({
      scale: transform.zoom,
      rotation: transform.totalRotation,
    }),
    background: '#ffffff',
    annotationMode: doc._pdfjs.module.AnnotationMode.ENABLE_STORAGE,
  }).promise
  host.append(canvas)
  return host
}

/** A screenshot of `rect` (user space) of the page in `host`. */
async function shot(host: HTMLElement, transform: PageTransform, rect: Rect) {
  const css = transform.toCssRect(rect)
  const probe = document.createElement('div')
  probe.style.cssText = `position:absolute;left:${css.left}px;top:${css.top}px;width:${css.width}px;height:${css.height}px;pointer-events:none;`
  host.append(probe)
  host.scrollIntoView()
  const base64 = await browserPage.screenshot({
    element: probe,
    base64: true,
    save: false,
  })
  probe.remove()
  const img = new Image()
  img.src = `data:image/png;base64,${base64}`
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height)
}

/**
 * The share of pixels whose brightness (the mean of the three channels) differs by more than 32.
 * Not each channel: Chrome on Linux gives text on the opaque page canvas coloured subpixel
 * edges and text on a transparent appearance canvas grey ones, which differ in colour, not in
 * brightness.
 */
function differing(a: ImageData, b: ImageData) {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(
        a.data[i]! +
          a.data[i + 1]! +
          a.data[i + 2]! -
          b.data[i]! -
          b.data[i + 1]! -
          b.data[i + 2]!
      ) / 3
    if (d > 32) n++
  }
  return n / (a.width * a.height)
}

describe('checkboxes, radios, choices and buttons', () => {
  it('checkbox toggles between its on-state and Off', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const [w] = widgetsOf(doc, 'agree')
    const box = controlOf(p.host, w!)
    expect(box.tagName).toBe('BUTTON')
    expect(box.getAttribute('role')).toBe('checkbox')
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect(doc.form.get('agree')).toBe('Off')
    await userEvent.click(box)
    expect(doc.form.get('agree')).toBe('Yes')
    expect(box.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(box)
    expect(doc.form.get('agree')).toBe('Off')
    // One history entry each.
    doc.history.undo()
    expect(doc.form.get('agree')).toBe('Yes')
    doc.history.undo()
    expect(doc.form.get('agree')).toBe('Off')
    expect(doc.history.canUndo.get()).toBe(false)
  })

  it('checkbox and radio draw the PDF’s on and off appearance', async () => {
    addTheme()
    const doc = await open('form-fields')
    const p = mountPage(doc, { highlight: false })
    await settled(p)
    const t = p.transform
    // The file has agree off, monthly on and yearly off.
    const pdf = await reference(doc, t, true)
    const [agree] = widgetsOf(doc, 'agree')
    const [monthly, yearly] = widgetsOf(doc, 'plan')
    expect(
      differing(await shot(p.host, t, agree!.rect), await shot(pdf, t, agree!.rect))
    ).toBeLessThanOrEqual(0.02)

    // The radios swap: yearly now shows the file's on look, and monthly its off look. The
    // file draws its two radios alike, so each is compared with the other as the file has it.
    await userEvent.click(controlOf(p.host, yearly!))
    controlOf(p.host, yearly!).blur()
    await settled(p)
    const yearlyOn = await shot(p.host, t, yearly!.rect)
    expect(differing(yearlyOn, await shot(pdf, t, monthly!.rect))).toBeLessThanOrEqual(
      0.02
    )
    expect(
      differing(await shot(p.host, t, monthly!.rect), await shot(pdf, t, yearly!.rect))
    ).toBeLessThanOrEqual(0.02)
    // The check can fail: yearly no longer looks as the file draws it.
    expect(differing(yearlyOn, await shot(pdf, t, yearly!.rect))).toBeGreaterThan(0.02)

    // The checkbox's on look is its own /AP /N /Yes, as PDF.js draws it in that state.
    await userEvent.click(controlOf(p.host, agree!))
    controlOf(p.host, agree!).blur()
    await settled(p)
    const copy = await open('form-fields')
    const checked = await storedReference(copy, createPageTransform(copy.pages[0]!, 1), [
      [agree!.id, true],
    ])
    const agreeOn = await shot(p.host, t, agree!.rect)
    expect(differing(agreeOn, await shot(checked, t, agree!.rect))).toBeLessThanOrEqual(
      0.02
    )
    expect(differing(agreeOn, await shot(pdf, t, agree!.rect))).toBeGreaterThan(0.02)

    // And back off.
    await userEvent.click(controlOf(p.host, agree!))
    controlOf(p.host, agree!).blur()
    await settled(p)
    expect(
      differing(await shot(p.host, t, agree!.rect), await shot(pdf, t, agree!.rect))
    ).toBeLessThanOrEqual(0.02)
  })

  it('draws the /MK /CA character for a widget without an on appearance', async () => {
    const doc = await open('form-fields')
    const bare = doc.form.fields.get().map((f): FormField =>
      f.name === 'agree'
        ? {
            ...f,
            widgets: f.widgets.map((w) => ({
              ...w,
              appearance: { ...w.appearance, onAppearance: false, checkStyle: '8' },
            })),
          }
        : f
    )
    doc.form._load(bare, doc.form._tabs)
    const p = mountPage(doc)
    const control = controlOf(p.host, widgetsOf(doc, 'agree')[0]!)
    expect(p.box('agree').hasAttribute('data-ink-drawn')).toBe(false)
    expect(control.textContent).toBe('')
    await userEvent.click(control)
    expect(p.box('agree').hasAttribute('data-ink-drawn')).toBe(true)
    expect(control.textContent).toBe('✘')
    await userEvent.click(control)
    expect(p.box('agree').hasAttribute('data-ink-drawn')).toBe(false)
    expect(control.textContent).toBe('')
  })

  it('a checkbox’s Mouse Up script sees its new state', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    const extra = p.widgetOf('extra')
    expect(getComputedStyle(p.box('extra')).display).toBe('none')
    await userEvent.click(controlOf(p.host, p.widgetOf('more')))
    expect(doc.form.get('more')).toBe('Yes')
    expect(doc.form.widgetState.get()[extra.id]?.hidden).toBe(false)
    expect(getComputedStyle(p.box('extra')).display).not.toBe('none')
    await userEvent.click(controlOf(p.host, p.widgetOf('more')))
    expect(doc.form.widgetState.get()[extra.id]?.hidden).toBe(true)
  })

  it('pressing a reset button with a Mouse Up script is one undo step', async () => {
    const doc = await open('form-scripted')
    const p = mountPage(doc)
    doc.form.set({ qty: '3', price: '2' })
    await userEvent.click(controlOf(p.host, p.widgetOf('clear')))
    expect(doc.form.get('qty')).toBeFalsy()
    doc.history.undo()
    expect(doc.form.get('qty')).toBe('3')
    expect(doc.form.get('total')).toBe('6')
    doc.history.undo()
    expect(doc.history.canUndo.get()).toBe(false)
  })

  it('radio picks one', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const [monthly, yearly] = widgetsOf(doc, 'plan').map((w) => controlOf(p.host, w))
    expect(monthly!.getAttribute('role')).toBe('radio')
    expect(doc.form.get('plan')).toBe('monthly')
    await userEvent.click(yearly!)
    expect(doc.form.get('plan')).toBe('yearly')
    expect(yearly!.getAttribute('aria-checked')).toBe('true')
    expect(monthly!.getAttribute('aria-checked')).toBe('false')
    // Clicking the chosen radio keeps it.
    await userEvent.click(yearly!)
    expect(doc.form.get('plan')).toBe('yearly')
  })

  it('shared export values stay apart', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const widgets = widgetsOf(doc, 'shared')
    const [first, second] = widgets.map((w) => controlOf(p.host, w))
    await userEvent.click(second!)
    expect(doc.form.get('shared')).toBe('1')
    expect(second!.getAttribute('aria-checked')).toBe('true')
    expect(first!.getAttribute('aria-checked')).toBe('false')
    // Only the second widget shows its on appearance.
    await p.mount.form!.rendered
    expect(shownCanvas(p.host, widgets[0]!.id)?.dataset.inkLook).toBe('unchecked')
    expect(shownCanvas(p.host, widgets[1]!.id)?.dataset.inkLook).toBe('checked')
  })

  it('Space toggles a focused checkbox, and arrows move within a radio group', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const agree = controlOf(p.host, widgetsOf(doc, 'agree')[0]!)
    agree.focus()
    await userEvent.keyboard(' ')
    expect(doc.form.get('agree')).toBe('Yes')
    await userEvent.keyboard('{Enter}')
    expect(doc.form.get('agree')).toBe('Yes')

    const [monthly, yearly] = widgetsOf(doc, 'plan').map((w) => controlOf(p.host, w))
    // The group is one Tab stop: its chosen radio.
    expect([monthly!.tabIndex, yearly!.tabIndex]).toEqual([0, -1])
    monthly!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(yearly)
    expect(doc.form.get('plan')).toBe('yearly')
    expect([monthly!.tabIndex, yearly!.tabIndex]).toEqual([-1, 0])
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(monthly)
    expect(doc.form.get('plan')).toBe('monthly')
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(yearly)
  })

  it('numbers a radio group and passes over hidden and read-only radios', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const widgets = widgetsOf(doc, 'plan')
    const [monthly, yearly] = widgets.map((w) => controlOf(p.host, w))
    const numbers = () =>
      [monthly!, yearly!].map((c) => [
        c.getAttribute('aria-posinset'),
        c.getAttribute('aria-setsize'),
      ])
    expect(numbers()).toEqual([
      ['1', '2'],
      ['2', '2'],
    ])

    doc.form._setWidgetState(widgets[1]!.id, { readOnly: true })
    monthly!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(monthly)
    expect(doc.form.get('plan')).toBe('monthly')

    doc.form._setWidgetState(widgets[1]!.id, { readOnly: false, hidden: true })
    expect(numbers()).toEqual([
      ['1', '1'],
      [null, null],
    ])
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(monthly)
    expect(doc.form.get('plan')).toBe('monthly')

    // A read-only radio picks nothing from the keyboard.
    doc.form._setWidgetState(widgets[1]!.id, { hidden: false })
    doc.form._setWidgetState(widgets[0]!.id, { readOnly: true })
    await userEvent.keyboard('{ArrowRight}')
    expect(doc.form.get('plan')).toBe('monthly')
  })

  it('combo shows labels and stores export values', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const select = controlOf<HTMLSelectElement>(p.host, p.widgetOf('country'))
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'United Kingdom',
      'France',
    ])
    expect(select.value).toBe('gb')
    const france = [...select.options].find((o) => o.textContent === 'France')!
    await userEvent.selectOptions(select, [france])
    expect(doc.form.get('country')).toBe('fr')
    doc.history.undo()
    expect(doc.form.get('country')).toBe('gb')
    expect(select.value).toBe('gb')
  })

  it('editable combo accepts free text', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const input = controlOf<HTMLInputElement>(p.host, p.widgetOf('city'))
    expect(input.tagName).toBe('INPUT')
    const list = p.box('city').querySelector('datalist')!
    expect(input.getAttribute('list')).toBe(list.id)
    expect([...list.options].map((o) => o.value)).toEqual(['Leeds', 'Lyon', 'Lisbon'])
    await typeOver(input, 'Lyon')
    input.blur()
    expect(doc.form.get('city')).toBe('Lyon')
    await typeOver(input, 'Nice')
    input.blur()
    expect(doc.form.get('city')).toBe('Nice')
  })

  it('multi-select list stores an array in option order', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    const select = controlOf<HTMLSelectElement>(p.host, p.widgetOf('interests'))
    expect(select.multiple).toBe(true)
    const option = (v: string) => [...select.options].find((o) => o.value === v)!
    await userEvent.selectOptions(select, [option('poetry')])
    expect(doc.form.get('interests')).toEqual(['poetry'])
    await userEvent.selectOptions(select, [option('poetry'), option('maths')])
    expect(doc.form.get('interests')).toEqual(['maths', 'poetry'])
  })

  it('push button runs its action', async () => {
    const doc = await open('form-fields')
    const p = mountPage(doc)
    doc.form.set({ name: 'Ada', agree: 'Yes', plan: 'monthly', country: 'fr' })
    const reset = controlOf(p.host, p.widgetOf('reset'))
    expect(reset.tagName).toBe('BUTTON')
    expect(reset.getAttribute('aria-label')).toBe('Reset')
    await userEvent.click(reset)
    // The PDF's defaults: plan's /DV, and empty or Off where there is none.
    expect(doc.form.get('plan')).toBe('yearly')
    expect(doc.form.get('agree')).toBe('Off')
    expect(doc.form.get('name')).toBe('')
    expect(doc.form.get('country')).toBe('')
  })

  /** The form-fields fixture in a viewer, with page 0's fields ready. */
  async function viewer() {
    const doc = await open('form-fields')
    const container = mountContainer(800, 600)
    container.style.overflow = 'auto'
    const engine = mountViewer({ container, document: doc, zoom: 1, buffer: 0 })
    cleanup.push(() => (engine.destroy(), container.remove()))
    await until(() => container.querySelector('[data-ink-field="name"] input') !== null)
    const fieldOf = (el: Element | null) =>
      el?.closest<HTMLElement>('[data-ink-widget]')?.dataset.inkField
    const pageOf = (el: Element | null) =>
      Number(el?.closest<HTMLElement>('.ink-page')?.dataset.page)
    return { doc, container, engine, fieldOf, pageOf }
  }

  /** Whether `el` is inside the container's visible area. */
  function inView(container: HTMLElement, el: Element) {
    const c = container.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return (
      r.top >= c.top && r.bottom <= c.bottom && r.left >= c.left && r.right <= c.right
    )
  }

  it('Tab follows /Tabs R and moves to the next page’s first field', async () => {
    const { container, engine, fieldOf, pageOf } = await viewer()
    container.querySelector<HTMLInputElement>('[data-ink-field="name"] input')!.focus()
    const visited = [fieldOf(document.activeElement)]
    for (let i = 0; i < 17; i++) {
      await userEvent.keyboard('{Tab}')
      visited.push(fieldOf(document.activeElement))
    }
    // Row by row as page 0 reads; a radio group is one stop, and so is the signature box.
    expect(visited).toEqual([
      'name',
      'notes',
      'pin',
      'code',
      'auto',
      'locked',
      'email',
      'internal',
      'agree',
      'plan',
      'shared',
      'country',
      'city',
      'header.ref',
      'interests',
      'styled',
      'sig',
      'reset',
    ])
    expect(pageOf(document.activeElement)).toBe(0)
    await userEvent.keyboard('{Tab}')
    expect(fieldOf(document.activeElement)).toBe('header.ref')
    expect(pageOf(document.activeElement)).toBe(1)
    expect(engine.pages.has(1)).toBe(true)
    expect(inView(container, document.activeElement!)).toBe(true)
    await userEvent.keyboard('{Tab}')
    expect(fieldOf(document.activeElement)).toBe('rotated')
    await userEvent.keyboard('{Tab}')
    expect(fieldOf(document.activeElement)).toBe('sig2')

    // From the last field of the last page, Tab leaves the viewer as usual.
    let prevented: boolean | undefined
    const spy = (e: KeyboardEvent) => (prevented = e.defaultPrevented)
    document.addEventListener('keydown', spy)
    cleanup.push(() => document.removeEventListener('keydown', spy))
    await userEvent.keyboard('{Tab}')
    expect(prevented).toBe(false)
  })

  it('Tab waits once for a next page that mounts after the scroll', async () => {
    const { container, engine, fieldOf, pageOf } = await viewer()
    // The view lands on page 1 a frame later, as a smooth scroll would.
    const scrollToRect = engine.viewport.scrollToRect.bind(engine.viewport)
    vi.spyOn(engine.viewport, 'scrollToRect').mockImplementation((...args) => {
      requestAnimationFrame(() => scrollToRect(...args))
    })
    let prevented: boolean | undefined
    const spy = (e: KeyboardEvent) => (prevented = e.defaultPrevented)
    document.addEventListener('keydown', spy)
    cleanup.push(() => document.removeEventListener('keydown', spy))
    container
      .querySelector<HTMLElement>('[data-ink-field="reset"] button')!
      .focus({ preventScroll: true })
    await nextFrame()
    expect(engine.pages.has(1)).toBe(false)
    await userEvent.keyboard('{Tab}')
    // Focus does not leave the viewer while the page mounts.
    expect(prevented).toBe(true)
    await until(() => pageOf(document.activeElement) === 1)
    expect(fieldOf(document.activeElement)).toBe('header.ref')
  })

  it('Shift+Tab goes back', async () => {
    const { container, engine, fieldOf, pageOf } = await viewer()
    engine.viewport.scrollToPage(1)
    await until(
      () =>
        container.querySelector(
          '.ink-page[data-page="1"] [data-ink-field="header.ref"] input'
        ) !== null
    )
    const first = container.querySelector<HTMLInputElement>(
      '.ink-page[data-page="1"] [data-ink-field="header.ref"] input'
    )!
    first.focus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(fieldOf(document.activeElement)).toBe('reset')
    expect(pageOf(document.activeElement)).toBe(0)
    expect(inView(container, document.activeElement!)).toBe(true)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(fieldOf(document.activeElement)).toBe('sig')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(fieldOf(document.activeElement)).toBe('styled')
  })
})
