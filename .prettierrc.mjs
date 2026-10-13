import base from '@ecssc/prettier-config'

// prettier-plugin-tailwindcss 0.6 crashes on Svelte files under Prettier 3.9 (its wrapped Svelte
// printer has no getVisitorKeys), so Svelte files use the Svelte plugin alone and give up class
// sorting. Every other file keeps the base plugins.
export default {
  ...base,
  overrides: [
    ...(base.overrides ?? []),
    {
      files: '*.svelte',
      options: { parser: 'svelte', plugins: ['prettier-plugin-svelte'] },
    },
  ],
}
