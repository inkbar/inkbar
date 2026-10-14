/// <reference types="vite/client" />
/// <reference types="@inkbar/core/vite/client" />

declare module '*?highlight' {
  const source: { html: string; code: string }
  export default source
}
