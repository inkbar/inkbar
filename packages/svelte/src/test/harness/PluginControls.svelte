<script lang="ts">
  import InkCommand from '../../lib/components/InkCommand.svelte'
  import InkRedo from '../../lib/components/InkRedo.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useCommand } from '../../lib/hooks/useCommand.svelte.js'
  import { useHistory } from '../../lib/hooks/useHistory.svelte.js'
  import { useReadable } from '../../lib/use-readable.svelte.js'

  import type { Mark } from '../../../../core/src/dom/plugins/test-plugin.js'
  import type { Readable, RecordStore } from '@inkbar/core'

  let {
    marks,
    finish,
  }: {
    marks: () => Readable<RecordStore<Mark> | null>
    finish: () => void
  } = $props()

  const NO_MARKS: readonly Mark[] = []
  const annotations = useAnnotations()
  const history = useHistory()
  const store = useReadable(() => marks(), null)
  const list = useReadable(() => store.current?.list, NO_MARKS)
  const accept = useCommand('sandbox.accept')
  const remove = () => {
    const id = list.current.find((m) => m.id === 'm1')?.annotationId
    if (id) annotations.remove(id)
  }
</script>

<InkToolbar>
  <InkCommand id="sandbox.accept" />
  <InkCommand id="sandbox.work" />
  <InkToolButton tool="sandbox.stamp" />
  <InkUndo />
  <InkRedo />
</InkToolbar>
<!-- Test-only box: the scroll container needs a bounded height. -->
<div style="height: 600px; width: 900px">
  <InkViewport />
</div>
<div
  data-testid="probe"
  data-annotations={annotations.annotations.length}
  data-marks={list.current.map((m) => m.status).join(',')}
  data-can-undo={String(history.canUndo)}
  data-accept-enabled={String(accept.enabled)}
  data-accept-label={accept.label}
>
  <button type="button" data-testid="remove" onclick={remove}>remove</button>
  <button type="button" data-testid="finish" onclick={finish}>finish</button>
</div>
