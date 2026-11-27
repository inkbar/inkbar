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

const DRAWING = 'packages/core/src/model/annotations/drawing'

/**
 * The imports a drawing may not make, from a file `depth` folders below drawing/. The package's
 * root index re-exports dom, so it is matched exactly at the file's own depth: a pattern of a
 * fixed number of `..` would also catch the pure modules beside drawing/ reached from deeper.
 */
const drawingImports = (depth) => {
  // src/ from the file: drawing/, annotations/ and model/, then one more per folder below drawing/.
  const src = Array.from({ length: 3 + depth }, () => '\\.\\.').join('/')
  const index = 'A drawing is described without the package index, which exports dom.'
  return [
    'error',
    {
      // A `#` name goes under paths: in a pattern group it would start a comment.
      paths: [
        { name: '#pdfjs-sandbox', message: 'A drawing is described without PDF.js.' },
      ],
      patterns: [
        {
          group: ['**/dom', '**/dom/**'],
          message: 'A drawing is described without the DOM: nothing under dom/.',
        },
        { regex: `^${src}(/index(\\.[cm]?[jt]s)?)?/?$`, message: index },
        { group: ['**/src/index', '@inkbar/core'], message: index },
        {
          group: ['pdfjs-dist', 'pdfjs-dist/**', '**/pdfjs', '**/pdfjs/**'],
          message: 'A drawing is described without PDF.js.',
        },
      ],
    },
  ]
}

/** The files the PDF.js quarantine covers. */
const PDFJS_FENCED = [
  'packages/**/*.{ts,mts,tsx,vue,svelte}',
  'apps/**/*.{ts,mts,tsx,vue,svelte}',
  'parity/**/*.ts',
]
/** Tests and the code only tests import. */
const TEST_FILES = ['**/*.{test,spec}.{ts,mts,tsx}', 'packages/core/src/test-support/**']
/**
 * Where PDF.js may be imported: core's pdfjs/, and the engine's save round-trip test, which uses
 * PDF.js as an independent reader of saved files.
 */
const PDFJS_ALLOWED = [
  'packages/core/src/pdfjs/**',
  'packages/engine/src/save.fixtures.test.ts',
]
/** core's test-only second reader, by any relative path. */
const SECOND_READER = '(^|/)second-reader(\\.[cm]?[jt]s)?$'
const SECOND_READER_MESSAGE =
  'pdfjs/second-reader opens files with PDF.js for tests only. Import it only from a test.'

/** PDF.js's own modules refused; with `secondReader`, core's second reader refused too. */
const pdfjsImports = ({ secondReader }) => {
  const message = 'Import PDF.js only inside packages/core/src/pdfjs/.'
  return [
    'error',
    {
      // A `#` name goes under paths: in a pattern group it would start a comment.
      paths: [
        { name: 'pdfjs-dist', message },
        { name: '#pdfjs-sandbox', message },
      ],
      patterns: [
        { group: ['pdfjs-dist/**'], message },
        ...(secondReader
          ? [{ regex: SECOND_READER, message: SECOND_READER_MESSAGE }]
          : []),
      ],
    },
  ]
}

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
      '**/dist-e2e/**',
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
    name: 'inkbar/sandbox-query-imports',
    files: ['apps/sandbox/src/**/*.{ts,tsx}'],
    rules: { 'import-x/no-duplicates': ['error', { considerQueryString: true }] },
  },
  {
    name: 'inkbar/react-hooks',
    files: [
      'packages/react/**/*.{ts,tsx}',
      'apps/e2e-react/**/*.{ts,tsx}',
      'apps/sandbox/src/**/*.tsx',
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
    files: ['packages/svelte/src/test/**/*.ts', 'apps/e2e-svelte/**/*.ts'],
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
    // Shipped code and apps reach PDF.js only through @inkbar/core, and only its scripting
    // sandbox; tests open files with it through core's second reader.
    files: PDFJS_FENCED,
    ignores: [...PDFJS_ALLOWED, ...TEST_FILES],
    rules: { 'no-restricted-imports': pdfjsImports({ secondReader: true }) },
  },
  {
    // Tests and their support may use the second reader, and nothing else of PDF.js.
    name: 'inkbar/pdfjs-quarantine-in-tests',
    files: PDFJS_FENCED.flatMap((fenced) => TEST_FILES.map((test) => [fenced, test])),
    ignores: PDFJS_ALLOWED,
    rules: { 'no-restricted-imports': pdfjsImports({ secondReader: false }) },
  },
  {
    // Beside it, under pdfjs/, the second reader is still for tests only.
    name: 'inkbar/second-reader-is-for-tests',
    files: ['packages/core/src/pdfjs/**/*.ts'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: SECOND_READER, message: SECOND_READER_MESSAGE }] },
      ],
    },
  },
  {
    // A drawing is a plain description of an annotation: no DOM, no PDF.js. This block sets the
    // rule afresh for these files, so it repeats the PDF.js entries of the quarantine above.
    name: 'inkbar/drawing-is-pure',
    files: [`${DRAWING}/**/*.ts`],
    rules: {
      'no-restricted-imports': drawingImports(0),
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'A drawing does not touch the DOM.' },
        { name: 'window', message: 'A drawing does not touch the DOM.' },
        ...[
          'navigator',
          'self',
          'globalThis',
          'location',
          'history',
          'localStorage',
          'sessionStorage',
          'getComputedStyle',
          'matchMedia',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'Node',
          'Element',
          'HTMLElement',
          'HTMLCanvasElement',
          'SVGElement',
          'Event',
          'CustomEvent',
          'MouseEvent',
          'PointerEvent',
          'KeyboardEvent',
          'MutationObserver',
          'ResizeObserver',
          'IntersectionObserver',
          'DOMParser',
          'XMLSerializer',
          'CanvasRenderingContext2D',
          'OffscreenCanvas',
          'OffscreenCanvasRenderingContext2D',
          'Image',
          'Path2D',
          'DOMMatrix',
          'DOMPoint',
          'DOMRect',
          'Range',
          'Text',
          'DocumentFragment',
          'screen',
          'alert',
        ].map((name) => ({ name, message: 'A drawing does not touch the DOM.' })),
        ...[
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'Worker',
          'Blob',
          'FileReader',
          'ImageData',
        ].map((name) => ({
          name,
          message: 'A drawing does no I/O: it is described from the annotation alone.',
        })),
      ],
    },
  },
  {
    // The same imports from a folder below drawing/ (pdf/, text/), one level further from src/.
    name: 'inkbar/drawing-is-pure-in-folders',
    files: [`${DRAWING}/*/*.ts`],
    rules: { 'no-restricted-imports': drawingImports(1) },
  }
)
