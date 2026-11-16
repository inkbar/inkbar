/** Code points that attach to the character before them: marks, variation selectors, skin tones, tags. */
function isExtend(c: string): boolean {
  if (/^\p{M}$/u.test(c)) return true
  const cp = c.codePointAt(0)!
  return (
    cp === 0x200c ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f)
  )
}

const ZWJ = '‍'
const isRegional = (c: string) => {
  const cp = c.codePointAt(0)!
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

/**
 * Splits `text` into characters a reader sees as one: a base with its marks, an emoji with its skin
 * tone or variation selector, a sequence joined by zero-width joiners (a family), and a pair of
 * regional indicators (a flag). Lines never break inside one, and the measure asks for one width.
 */
export function clusters(text: string): string[] {
  const out: string[] = []
  let joined = false
  for (const c of text) {
    const last = out.length - 1
    const flag =
      last >= 0 && isRegional(c) && [...out[last]!].length === 1 && isRegional(out[last]!)
    const glue = joined && !/\s/u.test(c)
    if (last >= 0 && (isExtend(c) || c === ZWJ || glue || flag)) out[last] += c
    else out.push(c)
    joined = c === ZWJ
  }
  return out
}
