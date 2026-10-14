/// <reference types="vite/client" />
/// <reference types="@inkbar/core/vite/client" />

declare module '*?highlight' {
  const source: { html: string; code: string }
  export default source
}

// For tools that read .ts files without Vue's compiler, such as typed linting. vue-tsc
// resolves the real components.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
