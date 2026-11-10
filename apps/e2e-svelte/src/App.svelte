<script lang="ts">
  import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
  import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
  import { clampPageCount } from '@inkbar/e2e-shared/page-count'

  import FormPage from './FormPage.svelte'
  import LinksPage from './LinksPage.svelte'
  import ReviewPage from './ReviewPage.svelte'

  const params = new URLSearchParams(location.search)
  const doc = params.get('doc') ?? 'text-simple'
  const large = clampPageCount(params.get('large'))
</script>

<main class="sandbox">
  <h1 class="sandbox-title">Inkbar review app</h1>
  {#if isFormFixture(doc)}
    <FormPage fixture={doc} />
  {:else if isLinksFixture(doc)}
    <LinksPage fixture={doc} />
  {:else}
    <ReviewPage fixture={doc} largePages={large} />
  {/if}
</main>
