// The icon each text markup kind draws in the highlight menu, shared by the vanilla menu and
// the framework bindings so a kind has one icon everywhere.
import {
  Highlighter,
  SpellCheck2,
  Strikethrough,
  Underline,
  type IconNode,
} from '@inkbar/icons'

import type { MarkupKind } from './tools'

export const MARKUP_ICONS: Readonly<Record<MarkupKind, IconNode>> = {
  highlight: Highlighter,
  underline: Underline,
  strikeout: Strikethrough,
  squiggly: SpellCheck2,
}
