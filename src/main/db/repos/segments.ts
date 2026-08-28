import { getDb } from '../index'

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
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(seg.meetingId, seg.tStartMs, seg.tEndMs, seg.speaker, seg.isUser ? 1 : 0, seg.text)
  return Number(res.lastInsertRowid)
}

/** Re-label a speaker's past segments when the user pins "that's me". */
export function setSpeakerIsUser(meetingId: number, speaker: number, isUser: boolean): void {
  getDb()
    .prepare(`UPDATE segments SET is_user = ? WHERE meeting_id = ? AND speaker = ?`)
    .run(isUser ? 1 : 0, meetingId, speaker)
}
