/** Parses a PDF date string (`D:YYYYMMDDHHmmSSOHH'mm'`) into ISO 8601. Returns `fallback` on anything unparseable. */
export function parsePdfDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const m =
    /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}(?:'\d{2}')?)?/.exec(
      value.trim()
    )
  if (!m) return fallback
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', zone] = m
  let offsetMinutes = 0
  if (zone && zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1
    const zh = Number(zone.slice(1, 3))
    const zm = Number(zone.slice(4, 6) || 0)
    offsetMinutes = sign * (zh * 60 + zm)
  }
  const utc =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) -
    offsetMinutes * 60_000
  if (Number.isNaN(utc)) return fallback
  return new Date(utc).toISOString()
}
