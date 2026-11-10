/** Runs `task(0..count-1)` with at most `limit` in flight; results come back in index order. */
export async function mapInOrder<T>(
  count: number,
  limit: number,
  task: (index: number) => Promise<T>
): Promise<T[]> {
  const results = new Array<T>(count)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < count) {
      const i = next++
      results[i] = await task(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker))
  return results
}
