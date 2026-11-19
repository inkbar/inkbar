import { defineSandboxConfig } from '@inkbar/e2e-shared/playwright'

// The redaction page is not in this sandbox yet.
export default defineSandboxConfig({ port: 5181, skip: ['redaction.spec.ts'] })
