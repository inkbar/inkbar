import { base } from '@ecssc/release-it-config'

// Lockstep release. The private root package.json holds the one version number
// that release-it bumps from conventional commits. After the bump, the
// `after:bump` hook copies that version into each public package so core, vue and
// theme always share it. After the release commit, tag and GitHub release exist,
// `pnpm publish` pushes the three packages to npm. pnpm rewrites `workspace:*`
// to the exact released version, so @inkbar/vue pins the @inkbar/core it was
// built against.
//
// release-it pushes the release commit and tag to `main` with the GitHub App
// token. Once `main` is protected, the App must be allowed to bypass the
// protection (or the protection must permit its pushes).
const PUBLIC = ['core', 'vue', 'theme']
const filters = PUBLIC.map((p) => `--filter @inkbar/${p}`).join(' ')

export default {
  ...base,
  git: {
    ...base.git,
    requireCleanWorkingDir: true,
    requireBranch: 'main',
    tagName: 'v${version}',
  },
  // The root is private. Publishing happens in `after:release`.
  npm: { publish: false },
  hooks: {
    'before:init': ['pnpm build', 'pnpm test'],
    'after:bump': [
      `pnpm -r ${filters} exec pnpm pkg set version=\${version}`,
      'git add packages/*/package.json',
    ],
    'after:release': [`pnpm -r ${filters} publish --access public --no-git-checks`],
  },
}
