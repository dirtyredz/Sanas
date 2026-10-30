import type { SuggestionMetadata } from '@shared/live-controls/types'
import { saveGrounding } from './suggestion-grounding'
import { getDb } from '../index'
import type { Suggestion, SuggestionPurpose, SuggestionTrigger } from '@shared/types'

export function listSuggestions(meetingId: number): Suggestion[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_ms AS tMs, trigger, purpose, text, grounding_context_id AS groundingContextId, context_revision AS contextRevision, source_suggestion_id AS sourceSuggestionId, request_text AS requestText, manual_kind AS manualKind
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
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, deck_version AS version, system, deck_context AS deck FROM suggestion_grounding_contexts WHERE meeting_id = ?',
    )
    .all(fromMeetingId) as { id: number; version: number; system: string; deck: string }[]
  for (const row of rows) {
    const target = saveGrounding(toMeetingId, row.version, row.system, row.deck)
    db.prepare(
      'UPDATE suggestions SET grounding_context_id = ? WHERE grounding_context_id = ?',
    ).run(target, row.id)
  }
  db.prepare('DELETE FROM suggestion_grounding_contexts WHERE meeting_id = ?').run(fromMeetingId)
  getDb()
    .prepare(`UPDATE suggestions SET meeting_id = ?, t_ms = t_ms + ? WHERE meeting_id = ?`)
    .run(toMeetingId, timeOffsetMs, fromMeetingId)
}

export function insertSuggestion(
  s: {
    meetingId: number
    tMs: number
    trigger: SuggestionTrigger
    purpose: SuggestionPurpose
    promptWindow: string
    text: string
  } & SuggestionMetadata,
): number {
  const res = getDb()
    .prepare(
      `INSERT INTO suggestions (meeting_id, t_ms, trigger, purpose, prompt_window, text, grounding_context_id, context_revision, source_suggestion_id, request_text, manual_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.meetingId,
      s.tMs,
      s.trigger,
      s.purpose,
      s.promptWindow,
      s.text,
      s.groundingContextId ?? null,
      s.contextRevision ?? null,
      s.sourceSuggestionId ?? null,
      s.requestText ?? null,
      s.manualKind ?? null,
    )
  return Number(res.lastInsertRowid)
}
