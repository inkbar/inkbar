import type { MessageFn } from './types'

type Params = Record<string, string | number>

/** Replaces each `{name}` with its param, numbers formatted by `numbers`; a missing one stays. */
function fill(numbers: Intl.NumberFormat, text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = Object.hasOwn(params, name) ? params[name] : undefined
    return v === undefined ? whole : typeof v === 'number' ? numbers.format(v) : v
  })
}

function withSource<F extends object>(fn: F, source: object): F {
  Object.defineProperty(fn, 'source', { value: source, enumerable: false })
  return fn
}

/**
 * A message with `{name}` placeholders. Numbers are formatted for `lang`, so 1200 reads
 * "1,200" in English and "1.200" in German. The text stays on the function as `source`.
 */
export function template<P extends Params>(lang: string, text: string): MessageFn<P> {
  const numbers = new Intl.NumberFormat(lang)
  return withSource((params: P) => fill(numbers, text, params), { text })
}

/**
 * A message that picks a form by the plural rule of `lang` for `param`. `forms.other` is the
 * fallback for a category the language has but the table leaves out.
 */
export function plural<P extends Params>(
  lang: string,
  param: keyof P & string,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): MessageFn<P> {
  const rules = new Intl.PluralRules(lang)
  const numbers = new Intl.NumberFormat(lang)
  return withSource(
    (params: P) => {
      const n = Number(params[param])
      return fill(numbers, forms[rules.select(n)] ?? forms.other, params)
    },
    { param, forms }
  )
}
