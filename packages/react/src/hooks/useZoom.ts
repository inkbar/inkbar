import { useMemo } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { ZoomValue } from '@inkbar/core/dom'

export function useZoom() {
  const ctx = useInkContext('useZoom()')
  const { viewport } = ctx
  const zoom = useReadable<ZoomValue>(viewport?.zoom, 'fit-width')
  const scale = useReadable<number>(viewport?.scale, 1)
  return useMemo(
    () => ({
      zoom,
      scale,
      setZoom: (z: ZoomValue) => viewport?.setZoom(z),
      zoomIn: () => viewport?.zoomBy(1.25),
      zoomOut: () => viewport?.zoomBy(0.8),
    }),
    [viewport, zoom, scale]
  )
}
