// A push button widget: a native `<button>`, clear over the PDF's own appearance, so its
// caption and look are the file's. Activating it (a click, Enter or Space) runs its Mouse Up
// script and then its action through the form: a JavaScript action in the sandbox, and a reset,
// submit, link, named or go-to action as the form runs them. Inkbar never sends, opens or
// prints itself; the host is told.
import type { WidgetState, WidgetView, WidgetViewContext } from './form-layer'

export function createButtonWidget(ctx: WidgetViewContext): WidgetView {
  const { form, field, widget } = ctx
  const el = ctx.box.ownerDocument.createElement('button')
  el.type = 'button'
  el.className = 'ink-form-control'
  // The caption names the button unless the file gives it a tooltip.
  el.setAttribute(
    'aria-label',
    field.tooltip?.trim() ? ctx.label : widget.appearance.caption?.trim() || ctx.label
  )
  el.style.cssText =
    'position:absolute;box-sizing:border-box;margin:0;padding:0;border:none;' +
    'background:transparent;transform-origin:center;'
  ctx.box.append(el)

  let state: WidgetState | undefined
  el.addEventListener('click', () => {
    if (!state || state.readOnly) return
    // One undo step: the Mouse Up's and the Action's scripts and the reset it may run.
    form._step(() => {
      if (widget.hasScripts) form._dispatch({ widget: widget.id, name: 'Mouse Up' })
      form._dispatch({ widget: widget.id, name: 'Action' })
    })
  })
  el.addEventListener('focus', () => form._dispatch({ widget: widget.id, name: 'Focus' }))
  el.addEventListener('blur', () => form._dispatch({ widget: widget.id, name: 'Blur' }))

  return {
    control: el,
    activates: true,
    drawn: false,
    sync(next) {
      state = next
    },
    layout() {},
    destroy() {
      el.remove()
    },
  }
}
