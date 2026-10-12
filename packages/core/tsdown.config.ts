import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    dom: 'src/dom/index.ts',
    vite: 'src/vite/index.ts',
  },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  // Ambient declarations for `virtual:inkbar-assets`, referenced as `@inkbar/core/vite/client`.
  copy: [{ from: 'src/vite/client.d.ts', to: 'dist/vite' }],
  external: ['pdfjs-dist', '#pdfjs', 'vite', /^node:/],
})
