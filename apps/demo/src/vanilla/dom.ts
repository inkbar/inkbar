/** `document.createElement` with attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  el.append(...children)
  return el
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button' }, label)
  b.addEventListener('click', onClick)
  return b
}
