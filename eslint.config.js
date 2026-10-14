import tsParser from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginSvelte from 'eslint-plugin-svelte'

import configDefault from '@ecssc/eslint-config/default'
import configTypescript from '@ecssc/eslint-config/typescript'
import configVue from '@ecssc/eslint-config/vue'

import svelteConfig from './packages/svelte/svelte.config.js'

const svelteScoped = (configs) =>
  configs.map((c) => ({ ...c, files: c.files ?? ['**/*.svelte', '**/*.svelte.ts'] }))

export default defineConfig(
  configDefault,
  configTypescript,
  configVue,
  ...svelteScoped(pluginSvelte.configs.recommended),
  ...svelteScoped(pluginSvelte.configs.prettier),
  { name: 'inkbar/files-to-lint', files: ['**/*.{ts,mts,tsx,vue,svelte}'] },
  {
    name: 'inkbar/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.{js,ts,mjs,mts}',
      '**/playwright/index.ts',
      '**/playwright/index.tsx',
      '**/playwright/.cache/**',
      'fixtures/pdf/**',
    ],
  },
  {
    name: 'inkbar/rules',
    settings: { tailwindcss: { config: false } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'tailwindcss/no-custom-classname': 'off',
      // Vite plugins provide `virtual:` modules; their types come from reference declarations.
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:', '\\?highlight$'] }],
    },
  },
  {
    name: 'inkbar/demo-highlight-imports',
    // A Vite plugin resolves `?highlight` imports; ESLint cannot see their default export.
    // Only each page's entry file imports them.
    files: ['apps/demo/src/*/main.{ts,tsx}'],
    rules: { 'import-x/default': 'off' },
  },
  {
    name: 'inkbar/demo-query-imports',
    files: ['apps/demo/src/**/*.{ts,tsx}'],
    rules: { 'import-x/no-duplicates': ['error', { considerQueryString: true }] },
  },
  {
    name: 'inkbar/react-hooks',
    files: [
      'packages/react/**/*.{ts,tsx}',
      'apps/sandbox-react/**/*.{ts,tsx}',
      'apps/demo/src/react/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': pluginReactHooks },
    // The React Compiler rules in the plugin's recommended set stay off: this package syncs an
    // external store into React from effects, which those rules flag by design.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    name: 'inkbar/svelte',
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
    rules: {
      // Props are destructured from `$props()` with `...rest`; the rule has no way to see that.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The TypeScript parser cannot type `.svelte` imports, so they arrive as `any`, and it
    // takes `svelte` and `svelte/attachments` for one module. `svelte-check` is the type gate
    // for these files.
    name: 'inkbar/svelte-untyped-imports',
    files: ['**/*.svelte'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'import-x/no-duplicates': 'off',
    },
  },
  {
    // The same `any` reaches the TypeScript files that import components.
    name: 'inkbar/svelte-untyped-imports-in-ts',
    files: [
      'packages/svelte/src/test/**/*.ts',
      'apps/sandbox-svelte/**/*.ts',
      'apps/demo/src/svelte/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    name: 'inkbar/pdfjs-quarantine',
    // Shipped code and apps reach PDF.js only through @inkbar/core's loader.
    files: ['packages/**/*.{ts,mts,tsx,vue,svelte}', 'apps/**/*.{ts,mts,tsx,vue,svelte}'],
    ignores: ['packages/core/src/pdfjs/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pdfjs-dist',
              message: 'Import PDF.js only inside packages/core/src/pdfjs/.',
            },
            {
              name: '#pdfjs',
              message: 'Import PDF.js only inside packages/core/src/pdfjs/.',
            },
          ],
          patterns: ['pdfjs-dist/**'],
        },
      ],
    },
  }
)
