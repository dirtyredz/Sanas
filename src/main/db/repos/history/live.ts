import type { Database } from 'better-sqlite3'
import { ftsAnyOf } from '../../fts-query'
import { ELIGIBLE_MEETING_SQL } from '../job/eligible-meeting'

/** Bounded, lightweight projections of past same-job history. Ranking and shaping live in
 * services/history/live; these take a connection so the read-only worker can run them too. */
export interface HistoryHit {
  meetingId: number
  title: string
  date: string
  text: string
  /** Segment start in ms; null for summary hits. */
  time: number | null
}
const SCOPE = `m.job_id=? AND m.id<>? AND ${ELIGIBLE_MEETING_SQL}`
const LIMIT = 6

export function transcriptHits(
  db: Database,
  jobId: number,
  currentId: number,
  query: string,
): HistoryHit[] {
  const match = ftsAnyOf(query)
  if (!match) return []
  return db
    .prepare(
      `SELECT m.id AS meetingId,substr(m.title,1,120) AS title,m.started_at AS date,s.t_start_ms AS time,
    substr(s.text,1,1800) AS text FROM segments_fts f
    JOIN segments s ON s.id=f.rowid JOIN meetings m ON m.id=s.meeting_id JOIN jobs j ON j.id=m.job_id
    WHERE segments_fts MATCH ? AND ${SCOPE} ORDER BY bm25(segments_fts),m.id,s.t_start_ms,s.id LIMIT ${LIMIT}`,
    )
    .all(match, jobId, currentId) as HistoryHit[]
}
export function summaryHits(
  db: Database,
  jobId: number,
  currentId: number,
  query: string,
): HistoryHit[] {
  const match = ftsAnyOf(query)
  if (!match) return []
  return db
    .prepare(
      `SELECT m.id AS meetingId,substr(m.title,1,120) AS title,m.started_at AS date,NULL AS time,
    snippet(summaries_fts,-1,'','','…',64) AS text FROM summaries_fts f
    JOIN meetings m ON m.id=f.rowid JOIN jobs j ON j.id=m.job_id
    WHERE summaries_fts MATCH ? AND ${SCOPE} ORDER BY bm25(summaries_fts),m.id LIMIT ${LIMIT}`,
    )
    .all(match, jobId, currentId) as HistoryHit[]
}
/** Temporal adjacency survives merges, unlike segment ID adjacency. Nearest first. */
export function neighbourSegments(db: Database, meetingId: number, time: number): string[] {
  return (
    db
      .prepare(
        `SELECT substr(text,1,500) AS text FROM segments WHERE meeting_id=? AND t_start_ms BETWEEN ? AND ? AND t_start_ms<>? ORDER BY abs(t_start_ms-?),t_start_ms,id LIMIT 2`,
      )
      .all(meetingId, time - 10_000, time + 10_000, time, time) as { text: string }[]
  ).map((n) => n.text)
}
