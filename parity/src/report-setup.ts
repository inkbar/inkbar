// Global setup of the browser project: a report run starts from an empty .report/, so the report
// never shows a drawing an earlier run wrote, and ends with an index of the pages it wrote.
// Loading the config alone, or a run without a report, leaves the folder alone.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../.report', import.meta.url))
const on = () => !['', '0'].includes(process.env.PARITY_REPORT ?? '')

export default function setup(): () => void {
  if (on()) rmSync(dir, { recursive: true, force: true })
  return () => {
    if (!on()) return
    mkdirSync(dir, { recursive: true })
    const pages = readdirSync(dir)
      .filter((f) => f.endsWith('.html') && f !== 'index.html')
      .sort()
    writeFileSync(
      `${dir}/index.html`,
      `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Parity report</title>
<style>body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }</style>
<h1>Parity report</h1>
${pages.length === 0 ? '<p>Nothing differs from its baseline.</p>' : `<ul>${pages.map((p) => `<li><a href="${p}">${p.replace(/\.html$/, '')}</a></li>`).join('')}</ul>`}
</html>
`
    )
  }
}
