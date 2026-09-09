import { getDb } from '../index'

export interface SpeakerName {
  speaker: number
  name: string
}

export function listSpeakerNames(meetingId: number): SpeakerName[] {
  return getDb()
    .prepare(`SELECT speaker, name FROM speakers WHERE meeting_id = ? ORDER BY speaker`)
    .all(meetingId) as SpeakerName[]
}

/** Names keyed by diarized index — the shape prompts, export and re-diarization consume. */
export function speakerNameMap(meetingId: number): Map<number, string> {
  return new Map(listSpeakerNames(meetingId).map((r) => [r.speaker, r.name]))
}

export function setSpeakerName(meetingId: number, speaker: number, name: string): void {
  const db = getDb()
  if (name.trim() === '') {
    db.prepare(`DELETE FROM speakers WHERE meeting_id = ? AND speaker = ?`).run(meetingId, speaker)
    return
  }
  db.prepare(
    `INSERT INTO speakers (meeting_id, speaker, name) VALUES (?, ?, ?)
     ON CONFLICT(meeting_id, speaker) DO UPDATE SET name = excluded.name`,
  ).run(meetingId, speaker, name.trim())
}

/** Fold every `from` segment into speaker `to` (fixing diarization drift). */
export function mergeSpeakers(meetingId: number, from: number, to: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(`UPDATE segments SET speaker = ? WHERE meeting_id = ? AND speaker = ?`).run(
      to,
      meetingId,
      from,
    )
    db.prepare(`DELETE FROM speakers WHERE meeting_id = ? AND speaker = ?`).run(meetingId, from)
  })()
}

/** Moves one meeting's speaker names onto another, into its speaker block (merge). */
export function reassignSpeakerNames(
  fromMeetingId: number,
  toMeetingId: number,
  speakerOffset: number,
): void {
  getDb()
    .prepare(`UPDATE speakers SET meeting_id = ?, speaker = speaker + ? WHERE meeting_id = ?`)
    .run(toMeetingId, speakerOffset, fromMeetingId)
}

export function clearSpeakerNames(meetingId: number): void {
  getDb().prepare(`DELETE FROM speakers WHERE meeting_id = ?`).run(meetingId)
}
