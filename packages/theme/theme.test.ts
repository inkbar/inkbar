import { readFileSync } from 'node:fs'

import postcss, { type AtRule, type Container, type Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')
const root = postcss.parse(css)

const rules: Rule[] = []
root.walkRules((r) => {
  rules.push(r)
})

function insideLayer(node: Rule): boolean {
  let p: Container | undefined = node.parent
  while (p && p.type !== 'root') {
    if (
      p.type === 'atrule' &&
      (p as AtRule).name === 'layer' &&
      (p as AtRule).params === 'inkbar'
    ) {
      return true
    }
    p = p.parent as Container | undefined
  }
  return false
}

/**
 * Zero specificity: one `:where(...)` holding the whole selector, optionally followed by a
 * pseudo-element (`::selection`), which `:where()` cannot contain.
 */
function isZeroSpecificity(selector: string): boolean {
  let ok = false
  selectorParser((sels) => {
    ok = sels.nodes.every((sel) => {
      const [first, ...rest] = sel.nodes
      if (!first || first.type !== 'pseudo' || first.value !== ':where') return false
      if (rest.length === 0) return true
      const [after] = rest
      return rest.length === 1 && after?.type === 'pseudo' && after.value.startsWith('::')
    })
  }).processSync(selector)
  return ok
}

describe('isZeroSpecificity', () => {
  it.each([
    ':where(.a)',
    ':where(.a .b, .c)',
    ':where(.a span)::selection',
    ':where(.a)::before',
  ])('accepts %s', (s) => expect(isZeroSpecificity(s)).toBe(true))
  it.each([
    '.a',
    '.a :where(.b)',
    ':where(.a) .b',
    ':where(.a):hover',
    ':where(.a)::before .b',
    ':where(.a)::before::after',
    ':is(.a)',
  ])('rejects %s', (s) => expect(isZeroSpecificity(s)).toBe(false))
})

describe('theme.css', () => {
  it('has only the layer at the top level', () => {
    const top = root.nodes.filter((n) => n.type !== 'comment')
    expect(
      top.map((n) => (n.type === 'atrule' ? `@${n.name} ${n.params}` : n.type))
    ).toEqual(['@layer inkbar'])
  })

  it('keeps every rule inside @layer inkbar', () => {
    expect(rules.length).toBeGreaterThan(0)
    const outside = rules.filter((r) => !insideLayer(r)).map((r) => r.selector)
    expect(outside).toEqual([])
  })

  it('wraps every selector in :where() for zero specificity', () => {
    const bad = rules.flatMap((r) => r.selectors).filter((s) => !isZeroSpecificity(s))
    expect(bad).toEqual([])
  })

  it('defines the annotation colour tokens on the root', () => {
    const rootRule = rules.find((r) => r.selector.startsWith(':where([data-ink-root]'))
    expect(rootRule).toBeDefined()
    const decls = new Set<string>()
    rootRule?.walkDecls((d) => {
      decls.add(d.prop)
    })
    for (const v of [
      '--ink-highlight',
      '--ink-underline',
      '--ink-strikeout',
      '--ink-squiggly',
      '--ink-note',
      '--ink-free-text',
      '--ink-shape',
      '--ink-ink',
      '--ink-redact',
      '--ink-redact-fill',
      '--ink-suggestion-low',
      '--ink-suggestion-medium',
      '--ink-suggestion-high',
    ]) {
      expect(decls.has(v), v).toBe(true)
    }
  })

  it('uses shadcn token names with fallbacks', () => {
    expect(css).toMatch(/var\(--primary,/)
    expect(css).toMatch(/var\(--border,/)
    expect(css).toMatch(/var\(--radius,/)
    expect(css).toMatch(/var\(--muted,/)
    expect(css).toMatch(/var\(--background,/)
    expect(css).toMatch(/var\(--foreground,/)
  })

  it('switches to dark tokens by media query and by the .dark class', () => {
    const media = root.nodes
      .flatMap((n) => (n.type === 'atrule' ? (n.nodes ?? []) : []))
      .filter((n): n is AtRule => n.type === 'atrule' && n.name === 'media')
    expect(media.some((m) => m.params.includes('prefers-color-scheme: dark'))).toBe(true)
    expect(rules.some((r) => r.selectors.some((s) => s.includes('.dark')))).toBe(true)
  })

  it('carries the PDF.js text layer rules the core text layer needs', () => {
    const textLayer = rules.filter((r) => r.selector.includes('.ink-text-layer'))
    const decl = (prop: string) =>
      textLayer.flatMap((r) => r.nodes).some((d) => d.type === 'decl' && d.prop === prop)
    for (const prop of [
      '--scale-round-x',
      '--scale-round-y',
      '--text-scale-factor',
      'font-size',
    ]) {
      expect(decl(prop), prop).toBe(true)
    }
    for (const angle of ['90', '180', '270']) {
      expect(
        textLayer.some((r) => r.selector.includes(`[data-main-rotation='${angle}']`)),
        angle
      ).toBe(true)
    }
    expect(textLayer.some((r) => r.selector.endsWith('::selection'))).toBe(true)
  })

  it('styles free text from the overlay custom properties', () => {
    const rule = rules.find((r) => r.selector === ':where(.ink-free-text)')
    expect(rule?.toString()).toMatch(/font-size:\s*var\(--ink-font-size\)/)
    expect(rule?.toString()).toMatch(/color:\s*var\(--ink-text-color,/)
    expect(rule?.toString()).toMatch(/opacity:\s*var\(--ink-opacity,/)
    for (const align of ['left', 'center', 'right']) {
      expect(
        rules.some((r) => r.selector.includes(`[data-align='${align}']`)),
        align
      ).toBe(true)
    }
  })
})
