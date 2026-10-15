/** An icon as the SVG elements it is drawn from: `[tag, attributes]` pairs. */
export type IconNode = readonly (readonly [
  tag: string,
  attrs: Readonly<Record<string, string>>,
])[]

/** The attributes every icon's `<svg>` takes; set `width` and `height` alongside. */
export const ICON_ATTRIBUTES: Readonly<Record<string, string>> = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}
