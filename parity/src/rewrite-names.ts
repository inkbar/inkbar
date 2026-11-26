/**
 * The fixtures `PARITY_BASELINE` names, from its value: none when empty, `['all']` for every
 * fixture, or the names listed with commas. Throws naming each name that is not in `known`, so a
 * misspelt name fails the run rather than rewriting nothing.
 */
export function rewriteNames(value: string, known: readonly string[]): string[] {
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const unknown = names.filter((name) => name !== 'all' && !known.includes(name))
  if (unknown.length > 0)
    throw new Error(
      `PARITY_BASELINE names ${unknown.join(', ')}, which the suite does not read: give fixtures that open, or all.`
    )
  return names
}
