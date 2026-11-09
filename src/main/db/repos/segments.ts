import { getDb } from '../index'
import type { Segment } from '@shared/types'

export function listSegments(meetingId: number): Segment[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_start_ms AS tStartMs, t_end_ms AS tEndMs,
              speaker, is_user AS isUser, text
       FROM segments WHERE meeting_id = ? ORDER BY t_start_ms`,
    )
    .all(meetingId)
    .map((r) => {
      const row = r as Omit<Segment, 'isUser'> & { isUser: number }
      return { ...row, isUser: row.isUser === 1 }
    })
}

/** The segments just before and after one (ids are sequential within a meeting), for
 *  showing a hit in context. Includes the segment itself. */
export function listSegmentsAround(
  meetingId: number,
  segmentId: number,
  radius: number,
): Segment[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_start_ms AS tStartMs, t_end_ms AS tEndMs,
              speaker, is_user AS isUser, text
       FROM segments WHERE meeting_id = ? AND id BETWEEN ? AND ? ORDER BY t_start_ms`,
    )
    .all(meetingId, segmentId - radius, segmentId + radius)
    .map((r) => {
      const row = r as Omit<Segment, 'isUser'> & { isUser: number }
      return { ...row, isUser: row.isUser === 1 }
    })
}

export function insertSegment(seg: {
  meetingId: number
  tStartMs: number
  tEndMs: number
  speaker: number
  isUser: boolean
  text: string
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO segments (meeting_id, t_start_ms, t_end_ms, speaker, is_user, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(seg.meetingId, seg.tStartMs, seg.tEndMs, seg.speaker, seg.isUser ? 1 : 0, seg.text)
  return Number(res.lastInsertRowid)
}

/** Explicit delete for callers that replace a transcript in place (re-diarization). A
 *  cascade from the meetings row runs the same FTS triggers, so removeMeeting needs none. */
export function deleteSegmentsForMeeting(meetingId: number): void {
  getDb().prepare(`DELETE FROM segments WHERE meeting_id = ?`).run(meetingId)
}

/** Highest diarized speaker index in a meeting; -1 when it has none. */
export function maxSpeaker(meetingId: number): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(MAX(speaker), -1) AS m FROM segments WHERE meeting_id = ?`)
    .get(meetingId) as { m: number }
  return row.m
}

/** Moves one meeting's segments onto another, shifting their times and speaker numbers
 *  (merge). Speaker -1 is the user in stereo capture and is never renumbered. */
export function reassignSegments(
  fromMeetingId: number,
  toMeetingId: number,
  timeOffsetMs: number,
  speakerOffset: number,
): void {
  getDb()
    .prepare(
      `UPDATE segments SET meeting_id = ?, t_start_ms = t_start_ms + ?, t_end_ms = t_end_ms + ?,
              speaker = CASE WHEN speaker >= 0 THEN speaker + ? ELSE speaker END
       WHERE meeting_id = ?`,
    )
    .run(toMeetingId, timeOffsetMs, timeOffsetMs, speakerOffset, fromMeetingId)
}

/** Re-label a speaker's past segments when the user pins "that's me". */
export function setSpeakerIsUser(meetingId: number, speaker: number, isUser: boolean): void {
  getDb()
    .prepare(`UPDATE segments SET is_user = ? WHERE meeting_id = ? AND speaker = ?`)
    .run(isUser ? 1 : 0, meetingId, speaker)
}
