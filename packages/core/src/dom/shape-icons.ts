// The icon each shape kind draws in the shape menu, shared by the vanilla menu and the
// framework bindings so a kind has one icon everywhere.
import {
  Circle,
  Hexagon,
  MessageSquare,
  MoveUpRight,
  RectangleHorizontal,
  Search,
  Slash,
  Square,
  SquareDashed,
  Star,
  type IconNode,
} from '@inkbar/icons'

import type { ShapeKind } from './tools'

export const SHAPE_ICONS: Readonly<Record<ShapeKind, IconNode>> = {
  line: Slash,
  arrow: MoveUpRight,
  rectangle: Square,
  roundedRectangle: RectangleHorizontal,
  ellipse: Circle,
  bubble: MessageSquare,
  star: Star,
  polygon: Hexagon,
  loupe: Search,
  mask: SquareDashed,
}
