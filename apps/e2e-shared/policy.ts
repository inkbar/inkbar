/**
 * The content security policy the policy spec serves the production build under: what the core
 * README tells a host to send when Inkbar's files are on the page's own origin, and nothing else.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src-attr 'unsafe-inline'",
  'frame-src blob:',
].join('; ')
