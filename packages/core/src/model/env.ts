/** True only when the build or runtime says production; browsers without `process` count as dev. */
export function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production'
  } catch {
    return false
  }
}
