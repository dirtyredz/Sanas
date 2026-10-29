/** Adds an audio-relative segment offset to SQLite's UTC datetime text. */
export function danglingMeetingEndedAt(startedAt: string, lastSegmentEndMs: number | null): string {
  if (lastSegmentEndMs === null) return startedAt

  const startedAtMs = Date.parse(`${startedAt.replace(' ', 'T')}Z`)
  const withMilliseconds = new Date(startedAtMs + lastSegmentEndMs)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ')
  return withMilliseconds.endsWith('.000') ? withMilliseconds.slice(0, 19) : withMilliseconds
}
