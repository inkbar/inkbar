import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { ZoomValue } from '@inkbar/core/dom'

export function useZoom() {
  const ctx = useInkContext('useZoom()')
  const zoom = useReadable<ZoomValue>(ctx.viewport?.zoom, 'fit-width')
  const scale = useReadable<number>(ctx.viewport?.scale, 1)
  return {
    zoom,
    scale,
    setZoom: (z: ZoomValue) => ctx.viewport?.setZoom(z),
    zoomIn: () => ctx.viewport?.zoomBy(1.25),
    zoomOut: () => ctx.viewport?.zoomBy(0.8),
  }
}
