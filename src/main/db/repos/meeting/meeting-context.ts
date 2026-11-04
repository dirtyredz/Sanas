import type { MeetingContext } from '@shared/live-controls/types'
import { getDb } from '../../index'

// Meeting context is append-only text revisions. Revision 0 is written by createMeeting
// (the text entered before Start, possibly empty); each Apply adds the next one. The
// `deck_version` column is legacy bookkeeping: new revisions repeat the latest row's value
// (always 0 for meetings created after presentation mode was retired).

export function getMeetingContext(meetingId: number): MeetingContext {
  const row = getDb()
    .prepare(
      `SELECT revision, text FROM meeting_context_revisions
    WHERE meeting_id = ? ORDER BY revision DESC LIMIT 1`,
    )
    .get(meetingId) as Pick<MeetingContext, 'revision' | 'text'> | undefined
  if (!row) throw new Error('Meeting not found.')
  return { meetingId, ...row }
}

export function saveMeetingContext(next: MeetingContext, atMs: number): void {
  const db = getDb()
  db.transaction(() => {
    if (getMeetingContext(next.meetingId).revision !== next.revision - 1)
      throw new Error('Context changed. Reload before applying.')
    db.prepare(
      `INSERT INTO meeting_context_revisions
       SELECT meeting_id, ?, ?, deck_version, ? FROM meeting_context_revisions
       WHERE meeting_id = ? ORDER BY revision DESC LIMIT 1`,
    ).run(next.revision, next.text, atMs, next.meetingId)
  })()
}

/** True when the meeting has ever had meeting context: nonempty initial text, or any applied
 *  revision (a later clear-to-empty still counts — that history exists). */
export function hasMeetingContext(meetingId: number): boolean {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM meeting_context_revisions
       WHERE meeting_id = ? AND (revision > 0 OR text <> '') LIMIT 1`,
    )
    .get(meetingId)
}

/** Merge: copies one meeting's whole context history onto another, shifting each revision by
 *  `revisionOffset` and its time by `timeOffsetMs` so it sits where that part sits on the
 *  merged timeline. Lands on the target's version-0 bookkeeping row. The source's own rows go
 *  when the source meeting is deleted. */
export function moveContextHistory(
  fromMeetingId: number,
  toMeetingId: number,
  revisionOffset: number,
  timeOffsetMs: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO meeting_context_revisions
       SELECT ?, revision + ?, text, 0, t_ms + ? FROM meeting_context_revisions
       WHERE meeting_id = ? ORDER BY revision`,
    )
    .run(toMeetingId, revisionOffset, timeOffsetMs, fromMeetingId)
}
