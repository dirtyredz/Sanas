import { getDb } from '../index'
import type { Suggestion, SuggestionPurpose, SuggestionTrigger } from '@shared/types'

export function listSuggestions(meetingId: number): Suggestion[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_ms AS tMs, trigger, purpose, text
       FROM suggestions WHERE meeting_id = ? ORDER BY t_ms`,
    )
    .all(meetingId) as Suggestion[]
}

/** Moves one meeting's suggestions onto another, shifting their time (merge). */
export function reassignSuggestions(
  fromMeetingId: number,
  toMeetingId: number,
  timeOffsetMs: number,
): void {
  getDb()
    .prepare(`UPDATE suggestions SET meeting_id = ?, t_ms = t_ms + ? WHERE meeting_id = ?`)
    .run(toMeetingId, timeOffsetMs, fromMeetingId)
}

export function insertSuggestion(s: {
  meetingId: number
  tMs: number
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
  promptWindow: string
  text: string
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO suggestions (meeting_id, t_ms, trigger, purpose, prompt_window, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(s.meetingId, s.tMs, s.trigger, s.purpose, s.promptWindow, s.text)
  return Number(res.lastInsertRowid)
}
