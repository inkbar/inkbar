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
      '@inkbar/react supplies the viewer, toolbar and popovers as components. Undo, Redo and Suggest redactions use its hooks.',
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
  },
  vue: {
    name: 'Vue',
    blurb:
      '@inkbar/vue supplies the viewer, toolbar and popovers as components. Undo, Redo and Suggest redactions use its composables.',
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
  },
  svelte: {
    name: 'Svelte',
    blurb:
      '@inkbar/svelte supplies the viewer, toolbar and popovers as components. Undo, Redo and Suggest redactions use its hooks.',
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
  },
  vanilla: {
    name: 'TypeScript',
    blurb:
      'No framework. @inkbar/core/dom provides the viewport, page layers and tools. The toolbar and popovers are plain TypeScript.',
    install: 'pnpm add @inkbar/core @inkbar/theme',
  },
}
