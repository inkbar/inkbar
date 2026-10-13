import base from '@ecssc/prettier-config'

// Svelte files use the Svelte plugin first and the Tailwind plugin last, which prettier-plugin-tailwindcss
// requires. Tailwind plugin 0.6 crashed on Svelte under Prettier 3.9; 0.8 works.
export default {
  ...base,
  overrides: [
    ...(base.overrides ?? []),
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
        plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
      },
    },
  ],
}
