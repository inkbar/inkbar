<script module lang="ts">
  import type { InkStorage } from '@inkbar/core'
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
    /**
     * Where the width is saved. Default: InkRoot's `storage` inside InkRoot, else none, and the
     * width lasts until unmount. Read once, when the sidebar is created.
     */
    storage?: InkStorage | undefined
    /**
     * The middle of the saved key, `sidebar.<name>.width`. Default: the side. Give two sidebars
     * on one side different names. Read once, when the sidebar is created.
     */
    name?: string | undefined
    /** In CSS px. Default 320; Enter or a double-click on the handle goes back to it. */
    defaultWidth?: number | undefined
    /** Default 240. */
    minWidth?: number | undefined
    /** Default 480. The shown width also stays within half the sidebar's container. */
    maxWidth?: number | undefined
    /**
     * Bindable, in CSS px. Bind it to a number to control the width: the handle then only
     * updates the binding, and storage is neither read nor written. Bound to a value that
     * starts undefined, it receives the width but the sidebar stays uncontrolled.
     */
    width?: number | undefined
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
   *
   * The handle on the inner edge resizes the sidebar. Its width is saved in `storage`, under
   * `sidebar.<name>.width`; inside `InkRoot` the root's storage is the default. `bind:width`
   * to a number makes the width the host's: drags and keys then only update the binding, and
   * storage is not read or written. The server renders the handle too.
   */
  import { createSidebarController } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useOptionalInkContext } from '../context.js'
  import { useReadable } from '../use-readable.svelte.js'

  import { setSidebarContext, type SidebarPanelEntry } from './sidebar-context.js'
  import SidebarTrigger from './SidebarTrigger.svelte'

  let {
    side = 'left',
    layout = 'rail',
    visible = true,
    open = $bindable(),
    storage,
    name,
    defaultWidth,
    minWidth,
    maxWidth,
    width = $bindable(),
    class: className,
    children,
    ...rest
  }: InkSidebarProps = $props()

  // The same ids on the server and the client.
  const idPrefix = $props.id()

  let entries = $state.raw<SidebarPanelEntry[]>([])
  const infos = () => entries.map((e) => e.info())

  // Read once: the controller loads the saved width as it is created.
  const inheritedStorage = useOptionalInkContext()?.storage

  /*
   * `width` is the host's only while it holds a number the sidebar did not write itself. The
   * sidebar writes every change back to the binding; on an unbound prop that sets the local
   * value, which would otherwise read as a controlling number and stop the saving. `written` is
   * the last width we wrote, and `controlled` sticks while the host keeps a number that is
   * not ours, or started with one.
   */
  let written: number | undefined
  let controlled = untrack(() => width !== undefined)
  /** The width props the host gave; an undefined one keeps the controller's. */
  function widthOptions(): Partial<
    Record<'defaultWidth' | 'minWidth' | 'maxWidth' | 'width', number>
  > {
    if (width === undefined) controlled = false
    else if (width !== written) controlled = true
    return {
      ...(defaultWidth !== undefined && { defaultWidth }),
      ...(minWidth !== undefined && { minWidth }),
      ...(maxWidth !== undefined && { maxWidth }),
      ...(controlled && width !== undefined && { width }),
    }
  }

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
      ...((storage ?? inheritedStorage) && { storage: (storage ?? inheritedStorage)! }),
      ...(name !== undefined && { name }),
      ...widthOptions(),
      onWidthChange: (value) => {
        written = value
        width = value
      },
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
    const next = { layout, side, visible, open, widths: widthOptions() }
    untrack(() =>
      controller.update({
        layout: next.layout,
        side: next.side,
        visible: next.visible,
        ...(next.open !== undefined && { open: next.open }),
        ...next.widths,
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

  // The panels register after the root rendered, so the server's and the first render's handle
  // is shown (as the root is: `data-state` is open while pending); the real `hidden` follows
  // once mounted.
  let mounted = $state(false)
  const view = $derived.by(() => {
    const s = current.current
    const handleAttrs = controller.handleAttrs()
    if (!mounted) delete handleAttrs.hidden
    return {
      layout: s.layout,
      root: controller.rootAttrs(),
      style: controller.rootStyle(),
      panels: controller.panelsAttrs(),
      handle: handleAttrs,
      tablist: controller.tablistAttrs(),
      triggers: s.panels.map((panel) => ({
        panel,
        attrs: controller.triggerAttrs(panel.id),
      })),
    }
  })

  let root = $state<HTMLDivElement | null>(null)
  let handle = $state<HTMLDivElement | null>(null)
  // The controller handles the triggers' clicks and keys, stack headers included. The panels
  // have registered by now.
  $effect(() => {
    const el = root
    if (!el) return
    const unbind = untrack(() => controller.bindTriggers(el))
    untrack(() => controller.update({ pending: false }))
    return unbind
  })
  // The controller handles the handle's drags, keys and double-click.
  $effect(() => {
    const el = handle
    if (!el || !root) return
    const host = root
    const unbind = untrack(() => controller.bindHandle(el))
    untrack(() => {
      mounted = true
      // Hydration keeps the server's markup: a width the client's storage gave applies here.
      for (const [prop, value] of Object.entries(controller.rootStyle()))
        host.style.setProperty(prop, value)
      for (const [attr, value] of Object.entries(controller.handleAttrs()))
        if (attr.startsWith('aria-value')) el.setAttribute(attr, value)
    })
    return unbind
  })
</script>

<div
  {...rest}
  bind:this={root}
  class={['ink-sidebar', className]}
  {...view.root}
  style:--ink-sidebar-width={view.style['--ink-sidebar-width']}
>
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
  <!-- The stack has no panels element: its id and class apply in rail and tabs only. -->
  <div
    class={{ 'ink-sidebar-panels': view.layout !== 'stack' }}
    {...view.layout !== 'stack' ? view.panels : {}}
  >
    {@render children?.()}
  </div>
  <!-- The last child, on the inner edge. -->
  <div bind:this={handle} class="ink-sidebar-handle" {...view.handle}></div>
</div>
