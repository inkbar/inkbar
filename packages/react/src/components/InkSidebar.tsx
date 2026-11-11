import {
  createSidebarController,
  type SidebarController,
  type SidebarLayout,
  type SidebarOpen,
  type SidebarPanelInfo,
  type SidebarSide,
} from '@inkbar/core/dom'
import {
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { InkContextObject } from '../context'
import { domAttrs } from '../dom-attrs'
import { useLatest } from '../use-latest'

import {
  SidebarContextObject,
  useSidebarState,
  type SidebarContext,
  type SidebarPanelEntry,
} from './sidebar-context'
import { SidebarTrigger } from './SidebarTrigger'

import type { InkStorage } from '@inkbar/core'

export interface InkSidebarProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Which edge the rail and border sit on. Default `'left'`. */
  side?: SidebarSide | undefined
  /** `'rail'` (default), `'tabs'` or `'stack'`. */
  layout?: SidebarLayout | undefined
  /** Default true. False hides the whole sidebar and keeps its open panel, content and scroll for when it shows again. */
  visible?: boolean | undefined
  /**
   * Controlled: the open panel's id (or null) for rail and tabs, the expanded ids for stack.
   * Leave it out for an uncontrolled sidebar.
   */
  open?: SidebarOpen | undefined
  /** Uncontrolled: what starts open. Left out, the first panel does. */
  defaultOpen?: SidebarOpen | undefined
  /** Called with the new value when a trigger is activated or the open panel goes. */
  onOpenChange?: ((open: SidebarOpen) => void) | undefined
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
   * Controlled, in CSS px: bind it to a number and update it from `onWidthChange`. Left out,
   * the sidebar keeps its own width, saved in `storage`.
   */
  width?: number | undefined
  /** Called with the new width when the handle is dragged or used by key. */
  onWidthChange?: ((width: number) => void) | undefined
  /** The `InkPanel`s. */
  children?: ReactNode
}

/** The width props the host gave; an undefined one keeps the controller's. */
function widthOptions(
  props: Pick<InkSidebarProps, 'defaultWidth' | 'minWidth' | 'maxWidth' | 'width'>
): Partial<Record<'defaultWidth' | 'minWidth' | 'maxWidth' | 'width', number>> {
  const { defaultWidth, minWidth, maxWidth, width } = props
  return {
    ...(defaultWidth !== undefined && { defaultWidth }),
    ...(minWidth !== undefined && { minWidth }),
    ...(maxWidth !== undefined && { maxWidth }),
    ...(width !== undefined && { width }),
  }
}

/** Sorts the panels by where their elements sit in the DOM. */
function inDomOrder(entries: readonly SidebarPanelEntry[]): SidebarPanelEntry[] {
  return [...entries].sort((a, b) => {
    const x = a.element()
    const y = b.element()
    if (!x || !y || x === y) return 0
    return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
}

/**
 * The panels' registry around the controller. Before the first mount, panels preregister as
 * they render, in render order, so the server and the browser's first render show the panel
 * core opens. From then on they register from layout effects, ordered by DOM position. A
 * removal is applied a microtask later: a panel remounted in the same commit (a new `key`) is
 * back by then, so its open state does not fall back. While the sidebar itself is unmounted
 * (on its way out, or StrictMode and `<Activity>` replaying effects) nothing is applied.
 */
function createRegistry(controller: SidebarController) {
  let mounted = false
  let started = false
  const early: SidebarPanelInfo[] = []
  let entries: SidebarPanelEntry[] = []

  const flush = (): void => {
    if (!mounted) return
    controller.update({ panels: inDomOrder(entries).map((e) => e.info) })
  }

  const context: SidebarContext = {
    controller,
    preregister(info) {
      if (started) return
      const at = early.findIndex((p) => p.id === info.id)
      if (at < 0) early.push(info)
      else early[at] = info
      controller.update({ panels: [...early] })
    },
    register(entry) {
      entries = [...entries, entry]
      flush()
      return () => {
        entries = entries.filter((e) => e !== entry)
        queueMicrotask(flush)
      }
    },
    changed: flush,
  }

  /** Binds the triggers and ends the controller's pending state; returns the unbind. */
  function mount(el: HTMLElement): () => void {
    mounted = true
    started = true
    const unbind = controller.bindTriggers(el)
    controller.update({
      panels: inDomOrder(entries).map((e) => e.info),
      pending: false,
    })
    return () => {
      mounted = false
      unbind()
    }
  }

  return { context, mount }
}

/**
 * A sidebar of `InkPanel`s: `createSidebar`'s markup on core's sidebar controller, which holds
 * the open state, the ARIA, the keys and the clicks. Rail and tabs render their triggers here;
 * in a stack each panel renders its own header. Panels take their place in DOM order, so a
 * panel rendered later slots in where it stands. A closed panel stays mounted and hidden, and
 * the panels' content stays in place across layouts, so its state survives switching.
 *
 * `open` with `onOpenChange` controls it; `defaultOpen` starts it uncontrolled; with neither,
 * the first panel starts open. It needs no document, so it works outside `InkRoot`. The server
 * renders the root, the panels (the open one shown), the stack headers and the resize handle;
 * rail and tab buttons follow once mounted.
 *
 * The handle on the inner edge resizes the sidebar. Its width is saved in `storage`, under
 * `sidebar.<name>.width`; inside `InkRoot` the root's storage is the default. `width` with
 * `onWidthChange` makes the width the host's: drags and keys then only report, and storage is
 * not read or written.
 */
export function InkSidebar({
  side = 'left',
  layout = 'rail',
  visible = true,
  open,
  defaultOpen,
  onOpenChange,
  storage: storageProp,
  name,
  defaultWidth,
  minWidth,
  maxWidth,
  width,
  onWidthChange,
  className,
  style,
  children,
  ...rest
}: InkSidebarProps) {
  const controlled = open !== undefined
  // Uncontrolled with `defaultOpen`, or once anything changed: the value we pass back.
  const [inner, setInner] = useState<SidebarOpen | undefined>(defaultOpen)
  const value = controlled ? open : inner
  const latest = useLatest({ controlled, onOpenChange, onWidthChange })
  const widths = widthOptions({ defaultWidth, minWidth, maxWidth, width })
  // Read once: the controller loads the saved width as it is created.
  const inherited = useContext(InkContextObject)?.storage
  // The same ids on the server and the client.
  const idPrefix = useId()
  const [{ context, mount }] = useState(() =>
    createRegistry(
      // Pending until mounted: an open id not registered yet is not a removed panel.
      createSidebarController({
        layout,
        side,
        visible,
        panels: [],
        ...(value !== undefined && { open: value }),
        pending: true,
        idPrefix,
        ...((storageProp ?? inherited) && { storage: (storageProp ?? inherited)! }),
        ...(name !== undefined && { name }),
        ...widths,
        onWidthChange: (next) => latest.current.onWidthChange?.(next),
        onOpenChange: (next) => {
          if (!latest.current.controlled) setInner(next)
          latest.current.onOpenChange?.(next)
        },
      })
    )
  )
  const { controller } = context
  const state = useSidebarState(controller)

  // A no-op change publishes nothing, so this cannot loop.
  useLayoutEffect(() => {
    controller.update({
      layout,
      side,
      visible,
      ...(value !== undefined && { open: value }),
      ...widths,
    })
    // `widths` is rebuilt each render; its four numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, layout, side, visible, value, defaultWidth, minWidth, maxWidth, width])

  // After the panels' own layout effects: they are registered by now. The controller handles
  // the triggers' clicks and keys, stack headers included.
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => mount(root.current!), [mount])
  // The controller handles the handle's drags, keys and double-click.
  const handle = useRef<HTMLDivElement>(null)
  // The panels register while the children render, after this component read the controller.
  // So the server's and the first render's handle is shown, as the root is (`data-state`
  // is open while pending), and the real `hidden` follows once mounted.
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => {
    setMounted(true)
    const el = handle.current!
    const unbind = controller.bindHandle(el)
    // Hydration keeps the server's markup: a width the client's storage gave applies here.
    for (const [prop, value] of Object.entries(controller.rootStyle()))
      root.current!.style.setProperty(prop, value)
    for (const [attr, value] of Object.entries(controller.handleAttrs()))
      if (attr.startsWith('aria-value')) el.setAttribute(attr, value)
    return unbind
  }, [controller])

  const handleAttrs = controller.handleAttrs()
  if (!mounted) delete handleAttrs.hidden

  const rail = state.layout === 'rail'
  return (
    <div
      {...rest}
      ref={root}
      className={cx('ink-sidebar', className)}
      style={{ ...style, ...controller.rootStyle() }}
      // The client's storage may hold another width than the server showed; see the effect.
      suppressHydrationWarning
      {...domAttrs(controller.rootAttrs())}
    >
      {state.layout !== 'stack' ? (
        <div
          className={rail ? 'ink-sidebar-rail' : 'ink-sidebar-tabs'}
          {...domAttrs(controller.tablistAttrs())}
        >
          {state.panels.map((panel) => (
            <button key={panel.id} {...domAttrs(controller.triggerAttrs(panel.id))}>
              <SidebarTrigger panel={panel} rail={rail} />
            </button>
          ))}
        </div>
      ) : null}
      {/* One element in every layout, so the panels are never remounted. */}
      {/* The stack has no panels element: its id and class apply in rail and tabs only. */}
      <div
        className={state.layout !== 'stack' ? 'ink-sidebar-panels' : undefined}
        {...(state.layout !== 'stack' && domAttrs(controller.panelsAttrs()))}
      >
        <SidebarContextObject.Provider value={context}>
          {children}
        </SidebarContextObject.Provider>
      </div>
      {/* The last child, on the inner edge. */}
      <div
        ref={handle}
        className="ink-sidebar-handle"
        suppressHydrationWarning
        {...domAttrs(handleAttrs)}
      />
    </div>
  )
}
