import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'

import { createPageMount, type PageMount } from './page-mount'
import { createPageRenderer } from './page-renderer'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'
import { mountViewer } from './viewer-engine'

import type { InkDocument } from '../model/document'
import type { FormWidget } from '../model/form/types'
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
    expect(layer!.querySelectorAll('input, textarea')).toHaveLength(
      TEXT_FIELDS_PAGE_0.length
    )
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

  it('renders a form page without widgets and draws their appearance in the layer', async () => {
    const doc = await open('form-fields')
    const page = await doc._pdfjs.getPage(0)
    const modes: unknown[] = []
    const render = page.render.bind(page)
    vi.spyOn(page, 'render').mockImplementation((params) => {
      modes.push(params.annotationMode)
      return render(params)
    })
    mountPage(doc)
    const { AnnotationMode } = doc._pdfjs.module
    await until(() => modes.length === 2)
    expect(modes).toContain(AnnotationMode.ENABLE_FORMS)
    expect(modes).toContain(AnnotationMode.ENABLE)
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
    await userEvent.click(input)
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
    const { AnnotationMode } = doc._pdfjs.module
    const render = page.render.bind(page)
    vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = render(params)
      if (params.annotationMode !== AnnotationMode.ENABLE) return task
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
    await p.mount.renderer.rendered
    const rect = p.transform.toCssRect(p.widgetOf('name').rect)
    await until(
      () => p.host.querySelector('[data-ink-form-appearance] canvas') !== null,
      10_000
    )

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
    const differing = (a: ImageData, b: ImageData) => {
      expect([a.width, a.height]).toEqual([b.width, b.height])
      let n = 0
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(
          Math.abs(a.data[i]! - b.data[i]!),
          Math.abs(a.data[i + 1]! - b.data[i + 1]!),
          Math.abs(a.data[i + 2]! - b.data[i + 2]!)
        )
        if (d > 8) n++
      }
      return n / (a.width * a.height)
    }
    const expected = await shot(pdf.host)
    const layered = await shot(p.host)
    const without = await shot(bare.host)
    expect(differing(layered, expected)).toBeLessThanOrEqual(0.02)
    // The check can fail: the page without the widget's appearance differs.
    expect(differing(without, expected)).toBeGreaterThan(0.02)
  })

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
    await p.mount.renderer.rendered
    await until(
      () => p.host.querySelector('[data-ink-form-appearance] canvas') !== null,
      10_000
    )
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
