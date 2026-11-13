/*
 * A sidebar of three panels beside a stand-in for the pages. The Search panel holds a field and
 * can be removed. With `stored`, the sidebar keeps its width in a store the page shows; with
 * `inRoot`, that store is InkRoot's and the sidebar inherits it. The store outlives a remount.
 */
import { MessageSquare, Search, Square } from '@inkbar/icons'
import { Activity, StrictMode, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { InkPanel } from '../../src/components/InkPanel'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSidebar } from '../../src/components/InkSidebar'

import { SignatureStorageProbe } from './SignatureStorageProbe'

import type { InkStorage, PdfAssets } from '@inkbar/core'
import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

export interface SidebarHarnessProps {
  layout?: SidebarLayout | undefined
  side?: SidebarSide | undefined
  /** Controls `open` from state starting at this; leave it out for an uncontrolled sidebar. */
  open?: SidebarOpen | undefined
  /** Uncontrolled, starting at this. */
  defaultOpen?: SidebarOpen | undefined
  /** Controls `width` from state starting at this; leave it out for an uncontrolled width. */
  width?: number | undefined
  /** The store's starting values. Leave it out for a sidebar with no store. */
  stored?: Record<string, unknown> | undefined
  /** Put the sidebar in an InkRoot that owns the store; needs `assets`. */
  inRoot?: boolean | undefined
  assets?: PdfAssets | undefined
  /** Keep the store from the sidebar, as a server without it would. */
  withoutStore?: boolean | undefined
  /** The row's width in CSS px, sidebar and pages together. Default: the page's. */
  containerWidth?: number | undefined
  /** The sidebar's own `minDocumentWidth`. */
  minDocumentWidth?: number | undefined
  /** InkRoot's `minDocumentWidth`, with `inRoot`. */
  rootMinDocumentWidth?: number | undefined
  handleLabel?: string | undefined
  /** Remount hides and shows the sidebar in an `<Activity>` instead of unmounting it. */
  activity?: boolean | undefined
}

export function SidebarHarness({
  layout,
  side,
  open,
  defaultOpen,
  width,
  stored,
  inRoot,
  assets,
  withoutStore,
  containerWidth,
  minDocumentWidth,
  rootMinDocumentWidth,
  handleLabel,
  activity,
}: SidebarHarnessProps) {
  const [widthControlled] = useState(width !== undefined)
  const [widthValue, setWidthValue] = useState<number | undefined>(width)
  const [shown, setShown] = useState(true)
  /** A store whose contents the page shows. */
  const [saved, setSaved] = useState<Record<string, unknown>>({ ...stored })
  const [storage] = useState<InkStorage>(() => {
    let data: Record<string, unknown> = { ...stored }
    return {
      get: (key) => data[key],
      set(key, value) {
        data = { ...data, [key]: value }
        setSaved(data)
      },
      remove(key) {
        data = { ...data }
        delete data[key]
        setSaved(data)
      },
    }
  })
  const [controlled] = useState(open !== undefined)
  const [value, setValue] = useState<SidebarOpen | undefined>(open)
  /** Every value `onOpenChange` reported, in order. */
  const [changes, setChanges] = useState<SidebarOpen[]>([])
  const [withSearch, setWithSearch] = useState(true)
  const [badge, setBadge] = useState(3)
  /** A new key remounts the Search panel. */
  const [searchKey, setSearchKey] = useState(0)
  const onOpenChange = (next: SidebarOpen) => {
    setChanges((list) => [...list, next])
    if (controlled) setValue(next)
  }
  const sidebar = (
    <InkSidebar
      {...(controlled ? { open: value ?? null } : { defaultOpen })}
      onOpenChange={onOpenChange}
      {...(widthControlled ? { width: widthValue, onWidthChange: setWidthValue } : {})}
      {...(stored && !inRoot && !withoutStore ? { storage } : {})}
      {...(minDocumentWidth !== undefined && { minDocumentWidth })}
      {...(handleLabel !== undefined && { handleLabel })}
      layout={layout}
      side={side}
      data-testid="sidebar"
    >
      <InkPanel id="pages" label="Pages" icon={Square}>
        <p>Pages content</p>
      </InkPanel>
      {withSearch ? (
        <InkPanel key={searchKey} id="search" label="Search" icon={Search} badge={badge}>
          <input aria-label="Query" />
        </InkPanel>
      ) : null}
      <InkPanel id="notes" label="Notes" icon={MessageSquare}>
        <p>Notes content</p>
      </InkPanel>
    </InkSidebar>
  )
  return (
    <>
      <button
        type="button"
        data-testid="toggle-search"
        onClick={() => setWithSearch((w) => !w)}
      >
        Toggle search
      </button>
      <button
        type="button"
        data-testid="open-notes"
        onClick={() => setValue(layout === 'stack' ? ['notes'] : 'notes')}
      >
        Open notes
      </button>
      <button
        type="button"
        data-testid="remount-search"
        onClick={() => setSearchKey((k) => k + 1)}
      >
        Remount search
      </button>
      <button type="button" data-testid="clear-badge" onClick={() => setBadge(0)}>
        Clear badge
      </button>
      <output data-testid="open">{JSON.stringify(value ?? null)}</output>
      <output data-testid="changes">{JSON.stringify(changes)}</output>
      <button type="button" data-testid="remount" onClick={() => setShown((v) => !v)}>
        Remount
      </button>
      <output data-testid="width">{JSON.stringify(widthValue ?? null)}</output>
      <output data-testid="stored">{JSON.stringify(saved)}</output>
      <Frame
        inRoot={inRoot}
        assets={assets}
        storage={storage}
        minDocumentWidth={rootMinDocumentWidth}
      >
        {inRoot ? <SignatureStorageProbe /> : null}
        <div
          style={{
            display: 'flex',
            height: 400,
            ...(containerWidth !== undefined && { width: containerWidth }),
          }}
        >
          {activity ? (
            <Activity mode={shown ? 'visible' : 'hidden'}>{sidebar}</Activity>
          ) : shown ? (
            sidebar
          ) : null}
          <div data-testid="pages" style={{ flex: 1, minWidth: 0 }}>
            Pages
          </div>
        </div>
      </Frame>
    </>
  )
}

function Frame({
  inRoot,
  assets,
  storage,
  minDocumentWidth,
  children,
}: {
  inRoot: boolean | undefined
  assets: PdfAssets | undefined
  storage: InkStorage
  minDocumentWidth: number | undefined
  children: ReactNode
}) {
  return inRoot ? (
    <InkRoot
      src={null}
      assets={assets!}
      storage={storage}
      {...(minDocumentWidth !== undefined && { minDocumentWidth })}
    >
      {children}
    </InkRoot>
  ) : (
    <div>{children}</div>
  )
}

/**
 * The harness under development StrictMode, where every effect mounts, unmounts and mounts
 * again. The component-test runner's own root does not replay effects for a nested
 * `<StrictMode>`, so the tree gets a root of its own.
 */
export function StrictSidebarHarness(props: SidebarHarnessProps) {
  const el = useRef<HTMLDivElement>(null)
  const { layout, side, open, defaultOpen } = props
  useEffect(() => {
    const root = createRoot(el.current!)
    root.render(
      <StrictMode>
        <SidebarHarness
          layout={layout}
          side={side}
          open={open}
          defaultOpen={defaultOpen}
        />
      </StrictMode>
    )
    return () => root.unmount()
  }, [layout, side, open, defaultOpen])
  return <div ref={el} />
}

/**
 * The harness rendered to a string, as a server would, then hydrated. A markup mismatch logs a
 * console error, which the console guard fails on. In a narrow `containerWidth`, the client
 * finds no room for the panel the server showed open.
 */
export function HydratedSidebarHarness(props: SidebarHarnessProps) {
  const el = useRef<HTMLDivElement>(null)
  const { layout, side, open, defaultOpen, stored, containerWidth } = props
  const [serverHtml, setServerHtml] = useState('')
  useEffect(() => {
    const tree = (
      <SidebarHarness
        layout={layout}
        side={side}
        open={open}
        defaultOpen={defaultOpen}
        stored={stored}
        containerWidth={containerWidth}
      />
    )
    const host = el.current!
    // The server has no store of its own: the client's gives another width after hydration.
    host.innerHTML = renderToString(
      <SidebarHarness
        layout={layout}
        side={side}
        open={open}
        defaultOpen={defaultOpen}
        stored={stored}
        containerWidth={containerWidth}
        withoutStore
      />
    )
    setServerHtml(host.innerHTML)
    const root = hydrateRoot(host, tree)
    return () => root.unmount()
    // `stored` is a literal that changes identity each render; its content is fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, side, open, defaultOpen, containerWidth])
  return (
    <>
      <template data-testid="server-html" data-html={serverHtml} />
      <div ref={el} />
    </>
  )
}
