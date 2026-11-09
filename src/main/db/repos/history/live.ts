import { UNSORTED_JOB_NAME } from '@shared/jobs/unsorted'
import type { Database } from 'better-sqlite3'
import { ftsAnyOf } from '../../fts-query'

export interface LiveHit {
  meetingId: number
  title: string
  date: string
  text: string
  time: number | null
  kind: 'transcript' | 'generated summary'
}
/** Lightweight, bounded projections. Both indexes are ranked independently. */
export function liveHits(db: Database, jobId: number, currentId: number, query: string): LiveHit[] {
  const match = ftsAnyOf(query)
  if (!match) return []
  const scope = `m.job_id=? AND m.id<>? AND m.ended_at IS NOT NULL AND m.practice=0 AND j.name<>'${UNSORTED_JOB_NAME}'`
  const transcript = db
    .prepare(
      `SELECT m.id AS meetingId,substr(m.title,1,120) AS title,m.started_at AS date,s.t_start_ms AS time,
    substr(s.text,1,1800) AS text,'transcript' AS kind FROM segments_fts f
    JOIN segments s ON s.id=f.rowid JOIN meetings m ON m.id=s.meeting_id JOIN jobs j ON j.id=m.job_id
    WHERE segments_fts MATCH ? AND ${scope} ORDER BY bm25(segments_fts),m.id,s.t_start_ms,s.id LIMIT 6`,
    )
    .all(match, jobId, currentId) as LiveHit[]
  const summaries = db
    .prepare(
      `SELECT m.id AS meetingId,substr(m.title,1,120) AS title,m.started_at AS date,NULL AS time,
    snippet(summaries_fts,-1,'','','…',64) AS text,'generated summary' AS kind FROM summaries_fts f
    JOIN meetings m ON m.id=f.rowid JOIN jobs j ON j.id=m.job_id
    WHERE summaries_fts MATCH ? AND ${scope} ORDER BY bm25(summaries_fts),m.id LIMIT 6`,
    )
    .all(match, jobId, currentId) as LiveHit[]
  const results: LiveHit[] = []
  for (let i = 0; i < 6; i++)
    for (const hit of [transcript[i], summaries[i]]) {
      if (
        !hit ||
        results.some(
          (h) =>
            h.meetingId === hit.meetingId && (h.kind === hit.kind || h.text.includes(hit.text)),
        )
      )
        continue
      if (hit.time !== null) {
        // Temporal adjacency survives merges, unlike segment ID adjacency. Keep the match first.
        const neighbors = db
          .prepare(
            `SELECT substr(text,1,500) AS text FROM segments WHERE meeting_id=? AND t_start_ms BETWEEN ? AND ? AND t_start_ms<>? ORDER BY abs(t_start_ms-?),t_start_ms,id LIMIT 2`,
          )
          .all(hit.meetingId, hit.time - 10_000, hit.time + 10_000, hit.time, hit.time) as {
          text: string
        }[]
        hit.text += neighbors.length
          ? '\nNearby transcript: ' + neighbors.map((n) => n.text).join(' ')
          : ''
      }
      results.push(hit)
      if (results.length === 3) return results
    }
  return results
}
