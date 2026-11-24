// The accessible name of a form field's control.
import type { InkMessages } from '../messages'
import type { FormField, FormWidget } from '../model/form/types'

/** A field's name: its tooltip, else the last part of its name. */
function fieldName(field: FormField, m: InkMessages): string {
  const tip = field.tooltip?.trim()
  if (tip) return tip
  return field.name.split('.').at(-1)?.trim() || m.forms.unnamed
}

/**
 * A control's accessible name: the field's tooltip, else the last part of its name, else
 * `forms.unnamed`. Each radio of a group shares the field, so a radio leads with its own
 * option, as the field's `/Opt` or its state name gives it, to tell the options apart. An
 * option that is only a number, or repeats the group's name, says nothing and is left out.
 */
export function controlLabel(
  field: FormField,
  widget: FormWidget | undefined,
  m: InkMessages
): string {
  const label = fieldName(field, m)
  if (field.type !== 'radio' || widget?.onState === undefined) return label
  const state = widget.onState
  const option = (field.options.find((o) => o.value === state)?.label ?? state).trim()
  if (!option || /^\d+$/.test(option) || option.toLowerCase() === label.toLowerCase())
    return label
  return m.forms.radioOption({ option, label })
}
