<script module lang="ts">
  import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkSidebarProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** Which edge the rail and border sit on. Default `'left'`. */
    side?: SidebarSide | undefined
    /** `'rail'` (default), `'tabs'` or `'stack'`. */
    layout?: SidebarLayout | undefined
    /** Default true. False hides the whole sidebar and keeps its open panel, content and scroll for when it shows again. */
    visible?: boolean | undefined
    /**
     * Bindable: the open panel's id (or null) for rail and tabs, the expanded ids for stack.
     * Left out, the first panel starts open.
     */
    open?: SidebarOpen | undefined
    /** The `InkPanel`s. */
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  /*
   * A sidebar of `InkPanel`s: `createSidebar`'s markup on core's sidebar controller, which holds
   * the open state, the ARIA, the keys and the clicks. Rail and tabs render their triggers here;
   * in a stack each panel renders its own header. Panels register as they initialise and take
   * their place in DOM order once mounted, so a panel added later with `{#if}` slots in where
   * it stands. A closed panel stays mounted and hidden, and the panels' content stays in place
   * across layouts, so its state survives switching.
   *
   * `bind:open` is the open panel's id (or null) for rail and tabs, and the expanded ids for
   * stack. Left out, the first panel starts open. It needs no document, so it works outside
   * `InkRoot`. The server renders the root, the panels (the open one shown) and the stack
   * headers; rail and tab buttons follow once mounted, as the panels register after the root
   * has rendered.
   */
  import { createSidebarController } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useReadable } from '../use-readable.svelte.js'

  import { setSidebarContext, type SidebarPanelEntry } from './sidebar-context.js'
  import SidebarTrigger from './SidebarTrigger.svelte'

  let {
    side = 'left',
    layout = 'rail',
    visible = true,
    open = $bindable(),
    class: className,
    children,
    ...rest
  }: InkSidebarProps = $props()

  // The same ids on the server and the client.
  const idPrefix = $props.id()

  let entries = $state.raw<SidebarPanelEntry[]>([])
  const infos = () => entries.map((e) => e.info())

  // Pending until mounted: the panels register one by one as they initialise, and an open id
  // not registered yet is not a removed panel.
  const controller = untrack(() =>
    createSidebarController({
      layout,
      side,
      visible,
      panels: [],
      ...(open !== undefined && { open }),
      pending: true,
      onOpenChange: (value) => {
        open = value
      },
      idPrefix,
    })
  )
  const current = useReadable(() => controller.state, controller.state.get())
  // Destroyed before the panels go: this pre-effect comes before the template's, so its
  // teardown runs first. Unregistering into a live controller would take each panel for a
  // removed one and write the fallback to the bound `open`.
  $effect.pre(() => () => controller.destroy())

  // Before the DOM updates, so the panels render the attributes these give.
  $effect.pre(() => {
    const next = { layout, side, visible, open }
    untrack(() =>
      controller.update({
        layout: next.layout,
        side: next.side,
        visible: next.visible,
        ...(next.open !== undefined && { open: next.open }),
      })
    )
  })
  // A panel's label, icon or badge changing.
  $effect.pre(() => {
    const panels = infos()
    untrack(() => controller.update({ panels }))
  })

  // Panels register while they initialise, inside the parent's render: untracked, so the
  // writes are not taken for state changed by a template expression. On the server too.
  function register(entry: SidebarPanelEntry): () => void {
    untrack(() => {
      entries = [...entries, entry]
      controller.update({ panels: infos() })
    })
    return () =>
      untrack(() => {
        entries = entries.filter((e) => e !== entry)
        controller.update({ panels: infos() })
      })
  }

  function arrange(): void {
    untrack(() => {
      const list = entries
      const sorted = [...list].sort((a, b) => {
        const x = a.element()
        const y = b.element()
        if (!x || !y || x === y) return 0
        return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      })
      if (sorted.some((e, i) => e !== list[i])) {
        entries = sorted
        controller.update({ panels: infos() })
      }
    })
  }

  setSidebarContext({ controller, state: current, register, arrange })

  const view = $derived.by(() => {
    const s = current.current
    return {
      layout: s.layout,
      root: controller.rootAttrs(),
      tablist: controller.tablistAttrs(),
      triggers: s.panels.map((panel) => ({
        panel,
        attrs: controller.triggerAttrs(panel.id),
      })),
    }
  })

  let root = $state<HTMLDivElement | null>(null)
  // The controller handles the triggers' clicks and keys, stack headers included. The panels
  // have registered by now.
  $effect(() => {
    const el = root
    if (!el) return
    const unbind = untrack(() => controller.bindTriggers(el))
    untrack(() => controller.update({ pending: false }))
    return unbind
  })
</script>

<div {...rest} bind:this={root} class={['ink-sidebar', className]} {...view.root}>
  {#if view.layout !== 'stack'}
    <div
      class={view.layout === 'rail' ? 'ink-sidebar-rail' : 'ink-sidebar-tabs'}
      {...view.tablist}
    >
      {#each view.triggers as t (t.panel.id)}
        <button {...t.attrs}>
          <SidebarTrigger panel={t.panel} rail={view.layout === 'rail'} />
        </button>
      {/each}
    </div>
  {/if}
  <!-- One element in every layout, so the panels are never remounted. -->
  <div class={{ 'ink-sidebar-panels': view.layout !== 'stack' }}>
    {@render children?.()}
  </div>
</div>
