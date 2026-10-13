import { defineConfig } from 'eslint/config'
import pluginReactHooks from 'eslint-plugin-react-hooks'

import configDefault from '@ecssc/eslint-config/default'
import configTypescript from '@ecssc/eslint-config/typescript'
import configVue from '@ecssc/eslint-config/vue'

export default defineConfig(
  configDefault,
  configTypescript,
  configVue,
  { name: 'inkbar/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },
  {
    name: 'inkbar/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.{js,ts,mjs,mts}',
      '**/playwright/index.ts',
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
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:'] }],
    },
  },
  {
    name: 'inkbar/react-hooks',
    files: ['packages/react/**/*.{ts,tsx}', 'apps/sandbox-react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': pluginReactHooks },
    // The React Compiler rules in the plugin's recommended set stay off: this package syncs an
    // external store into React from effects, which those rules flag by design.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    name: 'inkbar/pdfjs-quarantine',
    // Shipped code and apps reach PDF.js only through @inkbar/core's loader.
    files: ['packages/**/*.{ts,mts,tsx,vue}', 'apps/**/*.{ts,mts,tsx,vue}'],
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
