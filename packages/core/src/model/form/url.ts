/** The schemes a form may hand the host, as PDF.js allows for `/URI`. */
const SAFE = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * `url` when it is absolute and uses http, https, mailto or tel; otherwise `undefined`, so a
 * `javascript:`, `data:`, `file:` or relative URL from a PDF never reaches the host.
 */
export function safeUrl(url: string): string | undefined {
  try {
    return SAFE.has(new URL(url).protocol) ? url : undefined
  } catch {
    return undefined
  }
}

/**
 * A mail address, kept unless it reads as a URL with another scheme (a script passing
 * `javascript:…` as a recipient).
 */
export function safeAddress(address: string): string | undefined {
  try {
    return SAFE.has(new URL(address).protocol) ? address : undefined
  } catch {
    return address
  }
}
