<script lang="ts">
  import { usePage } from '../../lib/hooks/usePage.svelte.js'

  const page = usePage()
</script>

<output data-testid="current">{page.current}</output>
