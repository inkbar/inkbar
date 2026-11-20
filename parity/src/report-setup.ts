// Global setup of the browser project: a report run starts from an empty .report/, so the report
// never shows a page an earlier run wrote. Loading the config alone, or a run without a report,
// leaves the folder alone.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const mode = process.env.PARITY_REPORT ?? ''
  if (mode === '' || mode === '0') return
  rmSync(fileURLToPath(new URL('../.report', import.meta.url)), {
    recursive: true,
    force: true,
  })
}
