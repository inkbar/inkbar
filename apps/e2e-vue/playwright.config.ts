import { defineSandboxConfig } from '@inkbar/e2e-shared/playwright'

export default defineSandboxConfig({ port: 5180, previewPort: 4180, policyPort: 4183 })
