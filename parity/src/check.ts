// Holds a drawing or a part's data to its baseline, writing the baseline first when the run
// rewrites the fixture's. Each check gives the problem in words, or `undefined` when there is none.
import {
  readBaselinePng,
  readBaselineText,
  reporting,
  rewrites,
  writePng,
  writeText,
} from './baselines'
import { dataDifferences, describePixels, pixelDifference } from './differences'
import { stableJson } from './stable-json'

import type { Report } from './report'
import type { FixtureName } from '@inkbar/fixtures/urls'

const missing = (name: FixtureName, file: string) =>
  `no baseline at parity/baselines/${file} (PARITY_BASELINE=${name} writes it)`

/**
 * Holds `now`, a drawing of fixture `name`, to the baseline `file` (relative to `baselines/`),
 * pixel for pixel. `what` names the drawing in the problem and the report: `page 2`.
 */
export async function checkImage(
  name: FixtureName,
  file: string,
  what: string,
  now: ImageData,
  report: Report
): Promise<string | undefined> {
  if (rewrites(name)) await writePng(`baselines/${file}`, now)
  const baseline = await readBaselinePng(file)
  let problem: string | undefined
  if (baseline === null) problem = `${what}: ${missing(name, file)}`
  else if (baseline.width !== now.width || baseline.height !== now.height)
    problem = `${what} is ${now.width} × ${now.height} px; parity/baselines/${file} is ${baseline.width} × ${baseline.height} px`
  else {
    const difference = pixelDifference(baseline, now)
    if (difference.count > 0)
      problem = `${what} differs from parity/baselines/${file}: ${describePixels(difference)}`
  }
  if (problem !== undefined && reporting)
    await report.image(
      `${name}, ${what}`,
      file.replace('/', '-').replace(/\.png$/, ''),
      now,
      baseline
    )
  return problem
}

/**
 * Holds `now`, part of what fixture `name` reads as, to the baseline `file` written as
 * `stableJson` writes it. `undefined` (the part holds nothing) must have no baseline. `what` names
 * the part in the problem and the report: `links`.
 */
export async function checkData(
  name: FixtureName,
  file: string,
  what: string,
  now: unknown,
  report: Report
): Promise<string | undefined> {
  const text = now === undefined ? null : stableJson(now)
  if (rewrites(name) && text !== null) await writeText(`baselines/${file}`, text)
  const baseline = await readBaselineText(file)
  if (baseline === text) return undefined
  let lines: string[]
  if (baseline === null) lines = [`now ${stableJson(now).trim().slice(0, 200)}`]
  else if (text === null) lines = ['the fixture now holds none']
  else {
    lines = dataDifferences(JSON.parse(baseline), JSON.parse(text))
    // Equal as data but not as text: the file was edited by hand or written another way.
    if (lines.length === 0)
      lines = ['the same data, written differently: rewrite the file']
  }
  if (reporting) report.lines(`${name}, ${what}`, lines)
  const head =
    baseline === null
      ? `${what}: ${missing(name, file)}`
      : `${what} differs from parity/baselines/${file}`
  return `${head}:\n  ${lines.join('\n  ')}`
}
