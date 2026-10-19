<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { ToolId } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkToolButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    tool: ToolId
    label?: string | undefined
    children?: Snippet<[{ active: boolean; label: string }]> | undefined
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  import { TOOL_LABELS } from '@inkbar/core/dom'
  import {
    Highlighter,
    MessageSquare,
    PenLine,
    PenTool,
    Square,
    SquareDashedMousePointer,
    TextCursor,
    Type,
  } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useTool } from '../hooks/useTool.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { IconNode } from '@inkbar/icons'

  const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
    'select-text': TextCursor,
    select: SquareDashedMousePointer,
    highlight: Highlighter,
    'redact-area': Square,
    sketch: PenTool,
    draw: PenLine,
    note: MessageSquare,
    freetext: Type,
  }

  let {
    tool,
    label,
    class: className,
    children,
    child,
    onclick,
    ...rest
  }: InkToolButtonProps = $props()

  const current = useTool()
  const active = $derived(current.tool === tool)
  // A host tool has no built-in name or icon: `label` and `children` supply them.
  const name = $derived(label ?? TOOL_LABELS[tool] ?? tool)
  const icon = $derived(ICONS[tool])
</script>

<Toolbar.Button
  class={['ink-tool-button', className]}
  data-ink-tool-button=""
  data-tool={tool}
  data-state={active ? 'on' : 'off'}
  aria-pressed={active}
  aria-label={name}
  title={name}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) current.setTool(tool)
  }}
>
  {#if children}{@render children({ active, label: name })}{:else if icon}<InkIcon
      {icon}
    />{/if}
</Toolbar.Button>
