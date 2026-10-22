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

/** The rule that must beat element rules, so it is not zero specificity. */
const DRAGGING = ['[data-ink-dragging]', '[data-ink-dragging] *']

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

  it('wraps every selector in :where() for zero specificity, bar the dragging cursor', () => {
    const bad = rules
      .flatMap((r) => r.selectors)
      .filter((s) => !isZeroSpecificity(s) && !DRAGGING.includes(s))
    expect(bad).toEqual([])
  })

  it('shows the move cursor over everything while dragging, over any other rule', () => {
    const rule = rules.find((r) => r.selectors.includes('[data-ink-dragging] *'))
    expect(rule?.selectors).toEqual(DRAGGING)
    expect(rule?.toString()).toMatch(/cursor:\s*move !important/)
  })

  it('defines the annotation colour tokens on the root', () => {
    const rootRule = rules.find(
      (r) =>
        r.selector.includes('[data-ink-root]') &&
        r.nodes.some((d) => d.type === 'decl' && d.prop === '--ink-highlight')
    )
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
    ]) {
      expect(decls.has(v), v).toBe(true)
    }
  })

  it('defines the search match tokens once and multiplies the search layer with the page', () => {
    const declaring = (prop: string) =>
      rules.filter((r) => r.nodes.some((d) => d.type === 'decl' && d.prop === prop))
    for (const token of ['--ink-search-hit', '--ink-search-current']) {
      // Pages stay white in dark mode, so the light values serve both.
      expect(declaring(token), token).toHaveLength(1)
    }
    const layer = rules.find((r) => r.selector.includes('.ink-search-layer'))
    expect(
      layer?.nodes.some(
        (d) => d.type === 'decl' && d.prop === 'mix-blend-mode' && d.value === 'multiply'
      )
    ).toBe(true)
    expect(css).toMatch(/\[data-search-hit\]\[data-current\]/)
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
    expect(rule?.toString()).toMatch(/font-family:\s*var\(--ink-font-family,/)
    for (const v of [
      'font-weight:\\s*var\\(--ink-font-weight,',
      'font-style:\\s*var\\(--ink-font-style,',
      'text-decoration:\\s*var\\(--ink-text-decoration,',
      'background:\\s*var\\(--ink-fill,',
      'border-radius:\\s*var\\(--ink-corner-radius,',
    ])
      expect(rule?.toString()).toMatch(new RegExp(v))
    const border = rules.find((r) => r.selector === ':where(.ink-free-text[data-border])')
    // Its own colour token: --ink-border is the interface's.
    expect(border?.toString()).toMatch(/var\(--ink-border-width,.*var\(--ink-box-border,/)
    expect(
      rules.some((r) => r.selector === ":where(.ink-free-text[data-border='dashed'])")
    ).toBe(true)
    expect(rules.some((r) => r.selector === ':where(.ink-free-text[data-bubble])')).toBe(
      true
    )
    for (const align of ['left', 'center', 'right', 'justify']) {
      expect(
        rules.some((r) => r.selector.includes(`[data-align='${align}']`)),
        align
      ).toBe(true)
    }
  })

  /** The declarations of the rules whose selector list includes `selector`. */
  const declsFor = (selector: string): string =>
    rules
      .filter((r) => r.selectors.some((s) => s.includes(selector)))
      .map((r) => r.toString())
      .join('\n')

  it('styles the plugin card from the popover tokens', () => {
    const card = rules.filter((r) => r.selector.includes('.ink-card'))
    expect(card.length).toBeGreaterThan(0)
    expect(card.every(insideLayer)).toBe(true)
    const panel = declsFor(':where(.ink-card)')
    for (const token of ['--ink-surface', '--ink-fg', '--ink-border', '--ink-radius'])
      expect(panel, token).toContain(`var(${token})`)
    for (const part of [
      '.ink-card-title',
      '.ink-card-meta',
      '.ink-card-swatch',
      '.ink-card-body',
      '.ink-card-actions button',
    ])
      expect(declsFor(part), part).not.toBe('')
    // The first action is the primary one, as the thread's submit button.
    expect(declsFor('.ink-card-actions button:first-child')).toMatch(
      /background:\s*var\(--ink-accent\)/
    )
    expect(declsFor('.ink-card-actions button:focus-visible')).toMatch(
      /var\(--ink-ring\)/
    )
  })

  it('marks a mixed menu trigger', () => {
    expect(declsFor('.ink-menu-trigger[data-mixed]')).toMatch(/border-style:\s*dashed/)
  })

  it('keeps a split button chevron narrow, past the toolbar button minimum width', () => {
    const chevron = declsFor('.ink-split-button > .ink-menu-trigger')
    expect(chevron).toMatch(/min-width:\s*0/)
    expect(chevron).toMatch(/width:\s*1\.25rem/)
  })

  it('draws a split button as one control: joined corners, shared hover and on state', () => {
    expect(declsFor('.ink-split-button > .ink-tool-button')).toMatch(
      /border-start-end-radius:\s*0/
    )
    expect(declsFor('.ink-split-button > .ink-menu-trigger')).toMatch(
      /border-start-start-radius:\s*0/
    )
    expect(declsFor('.ink-split-button:hover')).toMatch(/background:/)
    expect(
      declsFor(
        ".ink-split-button > .ink-tool-button[data-state='on'] + .ink-menu-trigger"
      )
    ).toMatch(/background:\s*var\(--ink-accent\)/)
    // :has() costs frames on long documents (the 1,000-page e2e).
    expect(rules.filter((r) => r.selector.includes(':has('))).toEqual([])
  })

  it('styles a command button like a toolbar button, with its status beside it', () => {
    expect(declsFor('.ink-command')).toMatch(/display:\s*inline-flex/)
    const button = declsFor('.ink-command button')
    expect(button).toMatch(/min-width:\s*var\(--ink-control-size/)
    expect(button).toMatch(/height:\s*var\(--ink-control-size/)
    expect(declsFor('.ink-command button:disabled')).toMatch(/opacity:/)
    expect(declsFor('.ink-command button:focus-visible')).toMatch(/var\(--ink-ring\)/)
    expect(declsFor('.ink-command-status')).toMatch(/font-size:/)
  })

  it('rings the text style panel controls on keyboard focus', () => {
    for (const control of [
      '.ink-text-style-font:focus-visible',
      '.ink-text-style-input:focus-visible',
      '.ink-text-style-button:focus-visible',
    ])
      expect(declsFor(control), control).toMatch(/outline:\s*2px solid var\(--ink-ring\)/)
  })

  // Signatures are dark ink, in both themes: they need paper behind them.
  it('puts signature surfaces on a fixed light paper', () => {
    for (const surface of [
      '.ink-signature-pad-host',
      '.ink-signature-preview',
      '.ink-signature-font',
    ])
      expect(declsFor(`${surface})`), surface).toMatch(/background:\s*#fff\b/)
  })

  it('has no suggested-redaction styles', () => {
    expect(css).not.toMatch(/suggestion/i)
    expect(css).not.toMatch(/confidence/i)
    expect(css).not.toContain('data-origin')
  })

  it.each(['data-ink-popover', 'data-ink-form-alert'])(
    'gives portalled panels ([%s]) the tokens, in light and dark',
    (attr) => {
      const tokenRules = rules.filter((r) =>
        r.nodes.some((d) => d.type === 'decl' && d.prop === '--ink-fg')
      )
      const inMedia = (r: Rule) =>
        r.parent?.type === 'atrule' && (r.parent as AtRule).name === 'media'
      const light = tokenRules.find((r) =>
        r.nodes.some((d) => d.type === 'decl' && d.prop === '--ink-highlight')
      )
      const media = tokenRules.find(inMedia)
      const dark = tokenRules.find(
        (r) => !inMedia(r) && r.selector.includes('.dark [data-ink-root]')
      )
      expect(light?.selector).toContain(`[${attr}]`)
      expect(media?.selector).toContain(`[${attr}]:not(.light *)`)
      expect(dark?.selector).toContain(`.dark [${attr}]:not(.dark .light *)`)
    }
  )

  it('keeps a .light subtree light under a .dark ancestor', () => {
    const darkRule = rules.find(
      (r) =>
        r.selector.includes('.dark [data-ink-root]') &&
        r.nodes.some((d) => d.type === 'decl' && d.prop === '--ink-bg')
    )
    expect(darkRule).toBeDefined()
    const inner: string[] = []
    selectorParser((sels) => {
      sels.walkPseudos((p) => {
        if (p.value === ':where') for (const n of p.nodes) inner.push(n.toString().trim())
      })
    }).processSync(darkRule?.selector ?? '')
    const nested = inner.filter((s) => s.startsWith('.dark '))
    expect(nested.length).toBeGreaterThan(0)
    for (const s of nested) expect(s, s).toContain(':not(')
    for (const s of nested) expect(s, s).toContain('.dark .light *')
    expect(darkRule?.selector).toContain('[data-ink-root]:not(.light,')
  })

  it('defines the form tokens in light and dark', () => {
    const tokens = [
      '--ink-form-field-bg',
      '--ink-form-field-focus',
      '--ink-form-field-invalid',
    ]
    const has = (r: Rule) =>
      tokens.every((t) => r.nodes.some((d) => d.type === 'decl' && d.prop === t))
    const inMedia = (r: Rule) =>
      r.parent?.type === 'atrule' && (r.parent as AtRule).name === 'media'
    const light = rules.find(
      (r) =>
        !inMedia(r) &&
        r.selector.includes('[data-ink-root]') &&
        has(r) &&
        r.nodes.some((d) => d.type === 'decl' && d.prop === '--ink-highlight')
    )
    const media = rules.find((r) => inMedia(r) && has(r))
    const dark = rules.find(
      (r) => !inMedia(r) && r.selector.includes('.dark [data-ink-root]') && has(r)
    )
    expect(light).toBeDefined()
    expect(media).toBeDefined()
    expect(dark).toBeDefined()
    const layer = declsFor('.ink-form-layer)')
    expect(layer).toMatch(/z-index:\s*1/)
    expect(css).toMatch(/var\(--ink-form-field-bg\)/)
    expect(css).toMatch(/var\(--ink-form-field-focus\)/)
    expect(css).toMatch(/var\(--ink-form-field-invalid\)/)
    expect(css).toContain("[data-ink-form-highlight='off']")
  })

  it('stacks plugin layers above the overlay, letting presses through to the page', () => {
    const overlay = declsFor('.ink-overlay)')
    const layer = rules
      .find((r) => r.selector === ':where(.ink-plugin-layer)')
      ?.toString()
    const z = (css: string | undefined) => Number(/z-index:\s*(\d+)/.exec(css ?? '')?.[1])
    expect(z(layer)).toBeGreaterThanOrEqual(z(overlay))
    expect(layer).toMatch(/pointer-events:\s*none/)
    expect(declsFor('.ink-plugin-layer > *')).toMatch(/pointer-events:\s*auto/)
  })

  it('draws edit handles and hides them outside the select tools and the made state', () => {
    const handle = rules.find((r) => r.selector === ':where(.ink-handle)')
    expect(handle?.toString()).toMatch(/border:\s*1px solid var\(--ink-accent\)/)
    const hidden = rules.find((r) =>
      r.selector
        .replace(/\s+/g, ' ')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')')
        .includes(
          "[data-ink-tool]:not([data-ink-tool='select'], [data-ink-tool='select-text'], [data-ink-made]) .ink-handle"
        )
    )
    expect(hidden?.toString()).toMatch(/display:\s*none/)
  })
})
