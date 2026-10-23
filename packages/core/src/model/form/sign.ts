// Signing a signature field with a saved signature: a visual mark, pinned to the field. Nothing
// here signs the file with a certificate.
import { InkError } from '../errors'
import { placeSignature, type SignatureTemplate } from '../signatures'

import type { InkDocument } from '../document'

/** How much of the widget's box a signature fills, at most, on its constraining side. */
const FILL = 0.9

/**
 * Signs signature field `field` on its widget `widget` with template `t`, and returns the new
 * annotation's id. The signature (ink for a drawn one, a stamp for an image, `subject:
 * 'Signature'`) is fitted and centred in the widget's rect, upright as the page's `/Rotate`
 * shows it, and the field's value becomes `{ signature: id }`: one undo step, and in controlled
 * mode one change of each. A controlled host gets the annotation proposed, and the field is
 * signed once the host applies it.
 *
 * The signature is pinned to the field: it can be deleted, which clears the field, but not
 * moved or resized. Throws an `InkError`: `UnknownField` for a field or widget the form does
 * not have, `NotSignatureField` for another type, `FieldReadOnly` for a read-only or locked
 * field (one signed with a certificate included), and `FieldSigned` when it is already signed.
 */
export function signField(
  doc: InkDocument,
  field: string,
  widget: string,
  t: SignatureTemplate
): string {
  const form = doc.form
  const f = form.fields.get().find((x) => x.name === field)
  if (!f)
    throw new InkError('UnknownField', `There is no field named ${field}`, { field })
  if (f.type !== 'signature')
    throw new InkError('NotSignatureField', `${field} is not a signature field`, {
      field,
      type: f.type,
    })
  const w = f.widgets.find((x) => x.id === widget)
  if (!w)
    throw new InkError('UnknownField', `${field} has no widget ${widget}`, {
      field,
      widget,
    })
  const readOnly = form.widgetState.get()[widget]?.readOnly ?? f.flags.readOnly
  if (f.locked || readOnly)
    throw new InkError('FieldReadOnly', `${field} cannot be signed`, { field })
  // A signature a controlled host has not applied yet counts: the field is being signed.
  if (form.get(field) !== undefined || form._awaitingSignature(field))
    throw new InkError('FieldSigned', `${field} is already signed; clear it first`, {
      field,
    })
  const r = w.rect
  const rotation = doc.pages[w.page]?.rotate ?? 0
  // The box's sides as the page shows them: a quarter turn swaps them.
  const sideways = rotation === 90 || rotation === 270
  const across = sideways ? r.height : r.width
  const down = sideways ? r.width : r.height
  const width = Math.min(across, down * t.aspect) * FILL
  const centre = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  const input = placeSignature(t, w.page, centre, width, rotation)
  let id = ''
  doc.history.batch(() => {
    id = doc.annotations.add(input).id
    form._signWith(field, id)
  })
  return id
}
