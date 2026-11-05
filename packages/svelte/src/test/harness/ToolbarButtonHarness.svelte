<!-- A toolbar of the host's own buttons, with no viewer. -->
<script lang="ts">
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolbarButton from '../../lib/components/InkToolbarButton.svelte'

  let { onOpen }: { onOpen: () => void } = $props()
</script>

<InkToolbar>
  <InkToolbarButton>Share</InkToolbarButton>
  <InkToolbarButton class="host-open" onclick={onOpen}>Open a PDF</InkToolbarButton>
</InkToolbar>
