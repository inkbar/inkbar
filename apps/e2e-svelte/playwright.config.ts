import { defineSandboxConfig } from '@inkbar/e2e-shared/playwright'

export default defineSandboxConfig({ port: 5182, testIgnore: ['search.spec.ts'] })
