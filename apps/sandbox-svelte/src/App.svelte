<script lang="ts">
  import { clampPageCount } from '@inkbar/sandbox-shared/page-count'

  import ReviewPage from './ReviewPage.svelte'

  const params = new URLSearchParams(location.search)
  const doc = params.get('doc') ?? 'text-simple'
  const large = clampPageCount(params.get('large'))
</script>

<main class="sandbox">
  <h1 class="sandbox-title">Inkbar sandbox</h1>
  <ReviewPage fixture={doc} largePages={large} />
</main>
