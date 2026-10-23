// A signature field widget: a native `<button>` over the PDF's own appearance of the box. While
// the field is empty it shows "Sign", and activating it (a click, Enter or Space) asks the host
// to sign it through `onSignField`, anchored to the widget's box; the viewer opens the
// signature menu there. Once signed it shows nothing of its own: the signature is an annotation,
// drawn by the overlay above the field, and selecting and deleting it clears the field. A signed
// field is not signed again until it is cleared.
//
// The button's font size follows the box at each zoom (geometry); its look is the theme's.
import { FORM_LABELS } from './ui'

import type { WidgetState, WidgetView, WidgetViewContext } from './form-layer'

/** Points the "Sign" text is set in at 100%, unless the box is too short for it. */
const LABEL_SIZE = 12

export function createSignatureWidget(ctx: WidgetViewContext): WidgetView {
  const { form, field, widget } = ctx
  const el = ctx.box.ownerDocument.createElement('button')
  el.type = 'button'
  el.className = 'ink-form-control ink-form-sign'
  el.dataset.inkSignField = ''
  el.style.cssText =
    'position:absolute;box-sizing:border-box;margin:0;padding:0;border:none;' +
    'background:transparent;transform-origin:center;white-space:nowrap;overflow:hidden;'
  ctx.box.append(el)

  let state: WidgetState | undefined
  const signed = () => typeof state?.value === 'object' && !Array.isArray(state.value)
  const signable = () => state !== undefined && !state.readOnly && !signed()

  el.addEventListener('click', () => {
    if (!signable()) return
    ctx.onSignField?.({
      field: field.name,
      widget: widget.id,
      page: ctx.page,
      rect: widget.rect,
      anchor: ctx.box,
    })
  })
  el.addEventListener('focus', () => form._dispatch({ widget: widget.id, name: 'Focus' }))
  el.addEventListener('blur', () => form._dispatch({ widget: widget.id, name: 'Blur' }))

  return {
    control: el,
    drawn: false,
    sync(next) {
      state = next
      const isSigned = signed()
      if (isSigned) el.dataset.inkSigned = ''
      else delete el.dataset.inkSigned
      // Text only: the label is ours, the name is the file's.
      el.textContent = signable() ? FORM_LABELS.sign : ''
      if (signable()) {
        el.setAttribute('aria-label', `${FORM_LABELS.signField}: ${ctx.label}`)
        el.title = FORM_LABELS.signField
      } else {
        el.setAttribute('aria-label', ctx.label)
        el.removeAttribute('title')
      }
    },
    layout(frame) {
      el.style.fontSize = `${Math.min(LABEL_SIZE * frame.scale, frame.height * 0.6)}px`
    },
    destroy() {
      el.remove()
    },
  }
}
