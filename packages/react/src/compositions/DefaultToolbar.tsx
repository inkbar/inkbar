/*
 * The standard toolbar: tools, zoom and page controls with icons. It adds no styles of its
 * own; the theme styles the `data-ink-*` hooks. Extra controls go in `children`.
 */
import {
  Hand,
  Highlighter,
  MessageSquare,
  MousePointer2,
  Square,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { cx } from '../class-names'
import { InkPageCount } from '../components/InkPageCount'
import { InkPageInput } from '../components/InkPageInput'
import { InkToolbar } from '../components/InkToolbar'
import { InkToolButton } from '../components/InkToolButton'
import { InkZoomIn } from '../components/InkZoomIn'
import { InkZoomOut } from '../components/InkZoomOut'
import { InkZoomSelect } from '../components/InkZoomSelect'

import type { ReactNode } from 'react'

export interface DefaultToolbarProps {
  label?: string
  className?: string | undefined
  children?: ReactNode
}

const ICON = 18

export function DefaultToolbar({
  label = 'Document tools',
  className,
  children,
}: DefaultToolbarProps) {
  return (
    <InkToolbar
      label={label}
      className={cx('ink-default-toolbar', className)}
      data-ink-default-toolbar=""
    >
      <div
        className="ink-toolbar-group"
        data-ink-toolbar-group="tools"
        role="group"
        aria-label="Tools"
      >
        <InkToolButton tool="view">
          <Hand size={ICON} aria-hidden="true" />
        </InkToolButton>
        <InkToolButton tool="select">
          <MousePointer2 size={ICON} aria-hidden="true" />
        </InkToolButton>
        <InkToolButton tool="highlight">
          <Highlighter size={ICON} aria-hidden="true" />
        </InkToolButton>
        <InkToolButton tool="redact-area">
          <Square size={ICON} aria-hidden="true" />
        </InkToolButton>
        <InkToolButton tool="note">
          <MessageSquare size={ICON} aria-hidden="true" />
        </InkToolButton>
      </div>
      <div
        className="ink-toolbar-group"
        data-ink-toolbar-group="zoom"
        role="group"
        aria-label="Zoom"
      >
        <InkZoomOut>
          <ZoomOut size={ICON} aria-hidden="true" />
        </InkZoomOut>
        <InkZoomSelect />
        <InkZoomIn>
          <ZoomIn size={ICON} aria-hidden="true" />
        </InkZoomIn>
      </div>
      <div
        className="ink-toolbar-group"
        data-ink-toolbar-group="page"
        role="group"
        aria-label="Page"
      >
        <InkPageInput />
        <InkPageCount />
      </div>
      {children}
    </InkToolbar>
  )
}
