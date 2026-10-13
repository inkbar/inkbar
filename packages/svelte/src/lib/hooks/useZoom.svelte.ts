import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { ZoomValue } from '@inkbar/core/dom'

export function useZoom() {
  const ctx = useInkContext('useZoom()')
  const zoom = useReadable<ZoomValue>(() => ctx.viewport?.zoom, 'fit-width')
  const scale = useReadable<number>(() => ctx.viewport?.scale, 1)
  return {
    get zoom() {
      return zoom.current
    },
    get scale() {
      return scale.current
    },
    setZoom: (z: ZoomValue) => ctx.viewport?.setZoom(z),
    zoomIn: () => ctx.viewport?.zoomBy(1.25),
    zoomOut: () => ctx.viewport?.zoomBy(0.8),
  }
}
