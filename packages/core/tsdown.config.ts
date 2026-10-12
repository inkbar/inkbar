import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    dom: 'src/dom/index.ts',
  },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
  external: ['pdfjs-dist', '#pdfjs', 'vite', /^node:/],
})
