export type FrameworkId = 'react' | 'vue' | 'svelte' | 'vanilla'

export interface Framework {
  name: string
  blurb: string
  install: string
}

export const FRAMEWORK_ORDER: FrameworkId[] = ['react', 'vue', 'svelte', 'vanilla']

export const FRAMEWORKS: Record<FrameworkId, Framework> = {
  react: {
    name: 'React',
    blurb:
      'The viewer, toolbar and popovers are components from @inkbar/react. Undo, Redo and Suggest redactions are built from its hooks.',
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
  },
  vue: {
    name: 'Vue',
    blurb:
      'The viewer, toolbar and popovers are components from @inkbar/vue. Undo, Redo and Suggest redactions are built from its composables.',
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
  },
  svelte: {
    name: 'Svelte',
    blurb:
      'The viewer, toolbar and popovers are components from @inkbar/svelte. Undo, Redo and Suggest redactions are built from its hooks.',
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
  },
  vanilla: {
    name: 'TypeScript',
    blurb:
      'No framework. The viewport, page layers and tools come from @inkbar/core/dom; the toolbar and popovers are written by hand.',
    install: 'pnpm add @inkbar/core @inkbar/theme',
  },
}
