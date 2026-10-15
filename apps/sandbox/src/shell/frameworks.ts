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
      '@inkbar/react supplies the viewer, toolbar controls and popovers as components. Suggest redactions is a custom control built on its hooks.',
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
  },
  vue: {
    name: 'Vue',
    blurb:
      '@inkbar/vue supplies the viewer, toolbar controls and popovers as components. Suggest redactions is a custom control built on its composables.',
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
  },
  svelte: {
    name: 'Svelte',
    blurb:
      '@inkbar/svelte supplies the viewer, toolbar controls and popovers as components. Suggest redactions is a custom control built on its hooks.',
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
  },
  vanilla: {
    name: 'TypeScript',
    blurb:
      'No framework. createViewer from @inkbar/core/dom renders the viewer and popovers, and its controls build the toolbars. Suggest redactions is a custom control in actions.ts.',
    install: 'pnpm add @inkbar/core @inkbar/theme',
  },
}
