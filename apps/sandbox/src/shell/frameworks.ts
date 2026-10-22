export type FrameworkId = 'react' | 'vue' | 'svelte' | 'vanilla'

/** Every page the shell draws: one per framework, and the plugin page. */
export type PageId = FrameworkId | 'plugin'

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
      "@inkbar/react supplies the viewer, toolbar controls and popovers as components. This page registers an example plugin, Suggest redactions, and places its button with InkCommand. The plugin's code is on its own page.",
    install: 'pnpm add @inkbar/react @inkbar/core @inkbar/theme',
  },
  vue: {
    name: 'Vue',
    blurb:
      "@inkbar/vue supplies the viewer, toolbar controls and popovers as components. This page registers an example plugin, Suggest redactions, and places its button with InkCommand. The plugin's code is on its own page.",
    install: 'pnpm add @inkbar/vue @inkbar/core @inkbar/theme',
  },
  svelte: {
    name: 'Svelte',
    blurb:
      "@inkbar/svelte supplies the viewer, toolbar controls and popovers as components. This page registers an example plugin, Suggest redactions, and places its button with InkCommand. The plugin's code is on its own page.",
    install: 'pnpm add @inkbar/svelte @inkbar/core @inkbar/theme',
  },
  vanilla: {
    name: 'TypeScript',
    blurb:
      "No framework. createViewer from @inkbar/core/dom renders the viewer and popovers, and its controls build the toolbars. This page registers an example plugin, Suggest redactions, and places its button with createCommandButton. The plugin's code is on its own page.",
    install: 'pnpm add @inkbar/core @inkbar/theme',
  },
}

/** The plugin page, which runs the TypeScript viewer. */
export const PLUGIN_PAGE: Framework = {
  name: 'Writing a plugin',
  blurb:
    "A plugin adds a feature to Inkbar once, for every framework. This one is Suggest redactions: a command, records of suggestions, a mark for each one and a card to review it. It uses only Inkbar's public API. Every sandbox registers it in a line.",
  install: 'pnpm add @inkbar/core @inkbar/theme',
}
