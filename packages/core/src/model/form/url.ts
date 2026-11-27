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
 * `javascript:…` as a recipient). A `mailto:` or `tel:` prefix is kept as it was given, not
 * stripped, so the host may see `mailto:a@example.com` as a recipient.
 */
export function safeAddress(address: string): string | undefined {
  try {
    return SAFE.has(new URL(address).protocol) ? address : undefined
  } catch {
    return address
  }
}

/** A URL with a scheme of its own, as opposed to a file name or relative path. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Why an address from a link or outline item that `safeUrl` refused is not followed, told as core told
 * it with PDF.js. PDF.js reads a GoToR's file and destination into `file#dest`, and a
 * Launch's file as a bare name, so those two are told apart by the `#`; a scheme `safeUrl`
 * refuses (`javascript:`, `file:`, `data:`) is unsafe whatever follows it.
 */
export function unsafeUrlReason(unsafeUrl: string): 'remote' | 'launch' | 'unsafe-url' {
  if (HAS_SCHEME.test(unsafeUrl)) return 'unsafe-url'
  return unsafeUrl.includes('#') ? 'remote' : 'launch'
}
