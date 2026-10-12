import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { ZoomValue } from '@inkbar/core/dom'

export function useZoom() {
  const ctx = useInkContext('useZoom()')
  const zoom = useReadable<ZoomValue>(() => ctx.viewport.value?.zoom ?? null, 'fit-width')
  const scale = useReadable<number>(() => ctx.viewport.value?.scale ?? null, 1)
  return {
    zoom,
    scale,
    setZoom: (z: ZoomValue) => ctx.viewport.value?.setZoom(z),
    zoomIn: () => ctx.viewport.value?.zoomBy(1.25),
    zoomOut: () => ctx.viewport.value?.zoomBy(0.8),
  }
}
