/** Joins class names, dropping empties. */
export function cx(...parts: (string | undefined | null | false)[]): string | undefined {
  const out = parts.filter(Boolean).join(' ')
  return out === '' ? undefined : out
}
