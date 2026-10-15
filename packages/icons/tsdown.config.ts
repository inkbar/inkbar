import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  fixedExtension: true,
  dts: true,
  platform: 'neutral',
})
