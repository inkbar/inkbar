/**
 * Windows ANSI (code page 1252) as PDF's WinAnsiEncoding defines it: the characters of
 * 0x80–0x9F by their code. 0x20–0x7E are ASCII and 0xA0–0xFF Latin-1, each its own code;
 * 0x81, 0x8D, 0x8F, 0x90 and 0x9D are unassigned.
 */
const HIGH: ReadonlyMap<string, number> = new Map([
  ['€', 0x80],
  ['‚', 0x82],
  ['ƒ', 0x83],
  ['„', 0x84],
  ['…', 0x85],
  ['†', 0x86],
  ['‡', 0x87],
  ['ˆ', 0x88],
  ['‰', 0x89],
  ['Š', 0x8a],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['Ž', 0x8e],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['˜', 0x98],
  ['™', 0x99],
  ['š', 0x9a],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['ž', 0x9e],
  ['Ÿ', 0x9f],
])

/** `text` in Windows ANSI, one byte a character; undefined when a character has no code. */
export function winAnsi(text: string): Uint8Array | undefined {
  const out: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out.push(code)
    else {
      const high = HIGH.get(char)
      if (high === undefined) return undefined
      out.push(high)
    }
  }
  return new Uint8Array(out)
}

/**
 * `bytes` as a PDF literal string: `(`, `)` and `\` escaped, and every byte outside printable
 * ASCII written as three octal digits, so the operators stay ASCII and no line end is rewritten.
 */
export function pdfString(bytes: Uint8Array): string {
  let out = '('
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(b)
  }
  return `${out})`
}
