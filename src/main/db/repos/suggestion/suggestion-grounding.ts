import { readManualKind } from './manual-kind'
import { getDb } from '../../index'
import type { Suggestion } from '@shared/types'

export interface SuggestionGroundingRow extends Suggestion {
  system: string
  /** Legacy-only: the retired deck context; empty for meetings made since decks were removed. */
  cacheableContext: string
  promptWindow: string
}

/** A meeting's grounding row: the system prompt its answers were made with. */
export function saveMeetingGrounding(meetingId: number, system: string): number {
  return saveLegacyGrounding(meetingId, 0, system, '')
}

/** Legacy form that still carries the retired deck dimension (version + deck context). Only
 *  merge (copying a part's existing rows) and legacy replay need it; new meetings use
 *  saveMeetingGrounding. */
export function saveLegacyGrounding(
  meetingId: number,
  deckVersion: number,
  system: string,
  deckContext: string,
): number {
  const db = getDb()
  db.prepare(
    'INSERT OR IGNORE INTO suggestion_grounding_contexts (meeting_id, deck_version, system, deck_context) VALUES (?, ?, ?, ?)',
  ).run(meetingId, deckVersion, system, deckContext)
  return (
    db
      .prepare(
        'SELECT id FROM suggestion_grounding_contexts WHERE meeting_id = ? AND deck_version = ? AND system = ? AND deck_context = ?',
      )
      .get(meetingId, deckVersion, system, deckContext) as { id: number }
  ).id
}
export function detailSource(meetingId: number, id: number): SuggestionGroundingRow {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.meeting_id AS meetingId, s.t_ms AS tMs, s.trigger, s.purpose, s.text,
    s.prompt_window AS promptWindow, s.grounding_context_id AS groundingContextId, s.context_revision AS contextRevision,
    s.manual_kind AS manualKind, s.request_text AS requestText, g.system, g.deck_context AS cacheableContext
    FROM suggestions s JOIN suggestion_grounding_contexts g ON g.id = s.grounding_context_id
    WHERE s.id = ? AND s.meeting_id = ? AND g.meeting_id = s.meeting_id`,
    )
    .get(id, meetingId) as SuggestionGroundingRow | undefined
  if (!row) throw new Error('Source answer not found or has no saved grounding.')
  return { ...row, ...readManualKind(row.manualKind, row.requestText) }
}
export function existingDetail(meetingId: number, sourceId: number): number | undefined {
  return (
    getDb()
      .prepare(
        "SELECT id FROM suggestions WHERE meeting_id = ? AND source_suggestion_id = ? AND manual_kind = 'detail' LIMIT 1",
      )
      .get(meetingId, sourceId) as { id: number } | undefined
  )?.id
}
