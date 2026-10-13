import { observeAnnotationElement } from '@inkbar/core/dom'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

import type { InkContext } from '../context'
import type { Ref, ShallowRef } from 'vue'

/** The overlay element core draws for an annotation, for anchoring a popover to it. */
export function useAnnotationElement(
  ctx: InkContext,
  id: Readonly<Ref<string | null>>
): Readonly<ShallowRef<HTMLElement | null>> {
  const element = shallowRef<HTMLElement | null>(null)
  let stop: (() => void) | undefined
  watch(
    [id, () => ctx.rootEl.value],
    ([want, root]) => {
      stop?.()
      stop = undefined
      if (!want || !root) {
        element.value = null
        return
      }
      stop = observeAnnotationElement(root, want, (el) => {
        element.value = el
      })
    },
    { immediate: true, flush: 'post' }
  )
  onBeforeUnmount(() => stop?.())
  return element
}
