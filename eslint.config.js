import { defineConfig } from 'eslint/config'

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
      'fixtures/pdf/**',
    ],
  },
  {
    name: 'inkbar/rules',
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'tailwindcss/no-custom-classname': 'off',
    },
  },
  {
    name: 'inkbar/pdfjs-quarantine',
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/pdfjs/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pdfjs-dist', message: 'Import PDF.js only inside src/pdfjs/.' },
            { name: '#pdfjs', message: 'Import PDF.js only inside src/pdfjs/.' },
          ],
          patterns: ['pdfjs-dist/*'],
        },
      ],
    },
  }
)
