import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.test.ts', 'src/**/*.ct.ts'],
      tsconfigPath: './tsconfig.json',
      rollupTypes: false,
    }),
  ],
  build: {
    sourcemap: true,
    lib: { entry: './src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: {
      external: ['vue', 'reka-ui', 'lucide-vue-next', /^@inkbar\/core/],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
})
