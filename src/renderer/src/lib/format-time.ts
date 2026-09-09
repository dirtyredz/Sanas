/** Meeting-relative milliseconds → "m:ss" (or "h:mm:ss" past an hour). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mmss = `${h > 0 ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${mmss}` : mmss
}

/** SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) → local "Tue 8 Sep, 15:02". */
export function formatWhen(sqliteUtc: string): string {
  const d = new Date(sqliteUtc.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return sqliteUtc
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
