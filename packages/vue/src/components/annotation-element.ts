import { onBeforeUnmount, shallowRef, watch } from 'vue'

import type { InkContext } from '../context'
import type { Ref, ShallowRef } from 'vue'

/**
 * The overlay element core draws for an annotation, for anchoring a popover to it. Core
 * creates and removes these elements outside Vue (a page mounts as it scrolls into view), so
 * while an id is wanted this watches the root's subtree and resolves again until the element
 * exists, and again whenever it leaves the document.
 */
export function useAnnotationElement(
  ctx: InkContext,
  id: Readonly<Ref<string | null>>
): Readonly<ShallowRef<HTMLElement | null>> {
  const element = shallowRef<HTMLElement | null>(null)
  let observer: MutationObserver | undefined

  function resolve(): void {
    const want = id.value
    const root = ctx.rootEl.value
    const found =
      want && root
        ? root.querySelector<HTMLElement>(`[data-annotation="${CSS.escape(want)}"]`)
        : null
    if (found !== element.value) element.value = found
  }

  function stop(): void {
    observer?.disconnect()
    observer = undefined
  }

  watch(
    [id, () => ctx.rootEl.value],
    ([want, root]) => {
      stop()
      resolve()
      if (!want || !root) return
      observer = new MutationObserver(resolve)
      observer.observe(root, { childList: true, subtree: true })
    },
    { immediate: true, flush: 'post' }
  )
  onBeforeUnmount(stop)
  return element
}
