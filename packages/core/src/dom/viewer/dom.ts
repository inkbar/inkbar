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

/**
 * Sets the text `el` shows beside its icons: its first text node, else a new one at the end.
 * The other children (icons, check marks) and focus stay.
 */
export function setText(el: HTMLElement, text: string): void {
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
  if (node) {
    if (node.textContent !== text) node.textContent = text
  } else el.append(text)
}
