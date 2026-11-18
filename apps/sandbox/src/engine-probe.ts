/*
 * Loads @inkbar/engine through the production build, in the worker and with the wasm the
 * bundler emits for it, and shows the page count of the PDF it is served at
 * `engine-probe/text-simple.pdf`. Reached only with `?engine-probe`; ordinary visits never load it.
 */
export async function probeEngine(): Promise<void> {
  const out = document.createElement('output')
  out.dataset.engineProbe = ''
  document.body.append(out)
  const { createEngine } = await import('@inkbar/engine')
  const engine = await createEngine()
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}engine-probe/text-simple.pdf`)
    const doc = await engine.open(new Uint8Array(await res.arrayBuffer()))
    out.textContent = String(doc.pageCount)
  } finally {
    await engine.destroy()
  }
}
