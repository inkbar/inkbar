export type FrameworkId = 'react' | 'vue' | 'svelte' | 'vanilla'

export interface Framework {
  name: string
  /** The Inkbar package a host app of this framework imports. */
  package: string
  install: string
  /** The framework's mark, drawn in one colour as inline SVG. */
  mark: string
}

export const FRAMEWORK_ORDER: FrameworkId[] = ['react', 'vue', 'svelte', 'vanilla']

const svg = (body: string): string =>
  `<svg class="fw-mark" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`

export const FRAMEWORKS: Record<FrameworkId, Framework> = {
  react: {
    name: 'React',
    package: '@inkbar/react',
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
    mark: svg(
      '<g fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="12" rx="10" ry="3.8"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(120 12 12)"/></g><circle cx="12" cy="12" r="1.9" fill="currentColor"/>'
    ),
  },
  vue: {
    name: 'Vue',
    package: '@inkbar/vue',
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
    mark: svg(
      '<path fill="currentColor" d="M1.5 3.5h4.2L12 14.3l6.3-10.8h4.2L12 21.5z"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M7.4 3.5H10l2 3.4 2-3.4h2.6"/>'
    ),
  },
  svelte: {
    name: 'Svelte',
    package: '@inkbar/svelte',
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
    mark: svg(
      '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M16.6 5.3c-2.4-1.7-5.6-1.5-7.5.4-1.9 1.9-1.1 4.3 1.4 5.3l3.2 1.2c2.6 1 3.3 3.5 1.3 5.4-1.9 1.8-5.1 2-7.5.3"/>'
    ),
  },
  vanilla: {
    name: 'TypeScript',
    package: '@inkbar/core',
    install: 'pnpm add @inkbar/core @inkbar/theme',
    mark: svg(
      '<rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor"/><path fill="none" stroke="var(--fw-mark-cut, #fff)" stroke-width="2" stroke-linecap="round" d="M6 11.5h6M9 11.5V19M19 12.3c-.5-.6-1.3-.9-2.1-.9-1.2 0-2.1.6-2.1 1.6 0 2.2 4.4 1.5 4.4 3.8 0 1.1-1 1.7-2.3 1.7-.9 0-1.8-.4-2.3-1"/>'
    ),
  },
}
