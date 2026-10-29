// SQLite's datetime text: "YYYY-MM-DD HH:MM:SS[.SSS]", always UTC, with no zone marker —
// the form `datetime('now')` writes. Columns compare as text, so every value main builds
// for them comes from here, never from a hand-rolled toISOString slice.

/** Epoch ms → SQLite datetime text (UTC). 'seconds' truncates (what `datetime('now')`
 *  writes); 'milliseconds' keeps a non-zero fraction and drops a ".000" one. */
export function toSqliteDateTime(
  epochMs: number,
  precision: 'seconds' | 'milliseconds' = 'seconds',
): string {
  const iso = new Date(epochMs).toISOString().replace('T', ' ')
  if (precision === 'seconds') return iso.slice(0, 19)
  const withMs = iso.slice(0, 23)
  return withMs.endsWith('.000') ? withMs.slice(0, 19) : withMs
}

/** SQLite datetime text (UTC, no zone marker) → epoch ms. */
export function parseSqliteDateTime(text: string): number {
  return Date.parse(`${text.replace(' ', 'T')}Z`)
}
