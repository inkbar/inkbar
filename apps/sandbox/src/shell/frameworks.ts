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
      "@inkbar/react supplies the viewer, toolbar controls and popovers as components. This page adds Suggest redactions with Inkbar's public API: a button built on its hooks and a review card of its own.",
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
  },
  vue: {
    name: 'Vue',
    blurb:
      "@inkbar/vue supplies the viewer, toolbar controls and popovers as components. This page adds Suggest redactions with Inkbar's public API: a button built on its composables and a review card of its own.",
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
  },
  svelte: {
    name: 'Svelte',
    blurb:
      "@inkbar/svelte supplies the viewer, toolbar controls and popovers as components. This page adds Suggest redactions with Inkbar's public API: a button built on its hooks and a review card of its own.",
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
  },
  vanilla: {
    name: 'TypeScript',
    blurb:
      "No framework. createViewer from @inkbar/core/dom renders the viewer and popovers, and its controls build the toolbars. This page adds Suggest redactions with Inkbar's public API: a button in actions.ts and a review card in suggestion-card.ts.",
    install: 'pnpm add @inkbar/core @inkbar/theme',
  },
}
