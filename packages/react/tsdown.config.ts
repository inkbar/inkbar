import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  // Every export is a client component or hook: React Server Components hosts may import the
  // package directly.
  outputOptions: { banner: "'use client';" },
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'radix-ui',
      'lucide-react',
      /^@inkbar\/core/,
    ],
  },
})
