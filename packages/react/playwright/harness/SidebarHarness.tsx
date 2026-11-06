/* A sidebar of three panels, with no viewer. The Search panel holds a field and can be removed. */
import { MessageSquare, Search, Square } from '@inkbar/icons'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { InkPanel } from '../../src/components/InkPanel'
import { InkSidebar } from '../../src/components/InkSidebar'

import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

export interface SidebarHarnessProps {
  layout?: SidebarLayout | undefined
  side?: SidebarSide | undefined
  /** Controls `open` from state starting at this; leave it out for an uncontrolled sidebar. */
  open?: SidebarOpen | undefined
  /** Uncontrolled, starting at this. */
  defaultOpen?: SidebarOpen | undefined
}

export function SidebarHarness({ layout, side, open, defaultOpen }: SidebarHarnessProps) {
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
      <div style={{ display: 'flex', height: 400 }}>
        <InkSidebar
          {...(controlled ? { open: value ?? null } : { defaultOpen })}
          onOpenChange={onOpenChange}
          layout={layout}
          side={side}
          data-testid="sidebar"
        >
          <InkPanel id="pages" label="Pages" icon={Square}>
            <p>Pages content</p>
          </InkPanel>
          {withSearch ? (
            <InkPanel
              key={searchKey}
              id="search"
              label="Search"
              icon={Search}
              badge={badge}
            >
              <input aria-label="Query" />
            </InkPanel>
          ) : null}
          <InkPanel id="notes" label="Notes" icon={MessageSquare}>
            <p>Notes content</p>
          </InkPanel>
        </InkSidebar>
      </div>
    </>
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
 * console error, which the console guard fails on.
 */
export function HydratedSidebarHarness(props: SidebarHarnessProps) {
  const el = useRef<HTMLDivElement>(null)
  const { layout, side, open, defaultOpen } = props
  const [serverHtml, setServerHtml] = useState('')
  useEffect(() => {
    const tree = (
      <SidebarHarness layout={layout} side={side} open={open} defaultOpen={defaultOpen} />
    )
    const host = el.current!
    host.innerHTML = renderToString(tree)
    setServerHtml(host.innerHTML)
    const root = hydrateRoot(host, tree)
    return () => root.unmount()
  }, [layout, side, open, defaultOpen])
  return (
    <>
      <template data-testid="server-html" data-html={serverHtml} />
      <div ref={el} />
    </>
  )
}
