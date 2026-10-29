import { parseSqliteDateTime, toSqliteDateTime } from '../../../db/sqlite-time'

/** Adds an audio-relative segment offset to SQLite's UTC datetime text. */
export function danglingMeetingEndedAt(startedAt: string, lastSegmentEndMs: number | null): string {
  if (lastSegmentEndMs === null) return startedAt
  return toSqliteDateTime(parseSqliteDateTime(startedAt) + lastSegmentEndMs, 'milliseconds')
}
