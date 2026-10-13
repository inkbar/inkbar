import { useEmbedded } from '@inkbar/react'

export function EmbeddedBanner() {
  const { summary, total } = useEmbedded()
  if (total <= 0) return null
  return (
    <p className="sandbox-banner" role="status" data-testid="embedded-banner">
      This file already contains {total} annotation{total === 1 ? '' : 's'} (
      {summary.map((s) => `${s.count} ${s.subtype}`).join(', ')}).
    </p>
  )
}
