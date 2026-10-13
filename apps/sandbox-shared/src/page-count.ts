/** The most pages the performance check may generate. */
export const MAX_LARGE_PAGES = 5000

/**
 * Reads the `?large=` query value: 0 when absent, otherwise a whole number from 1 to
 * `MAX_LARGE_PAGES`. A value that is not a finite number falls back to the default of 1.
 */
export function clampPageCount(raw: string | null): number {
  if (raw === null) return 0
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_LARGE_PAGES, Math.max(1, n))
}
