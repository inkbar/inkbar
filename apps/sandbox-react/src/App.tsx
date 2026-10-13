import { clampPageCount } from '@inkbar/sandbox-shared/page-count'

import { ReviewPage } from './ReviewPage'

const params = new URLSearchParams(location.search)
const doc = params.get('doc') ?? 'text-simple'
const large = clampPageCount(params.get('large'))

export function App() {
  return (
    <main className="sandbox">
      <h1 className="sandbox-title">Inkbar sandbox</h1>
      <ReviewPage fixture={doc} largePages={large} />
    </main>
  )
}
