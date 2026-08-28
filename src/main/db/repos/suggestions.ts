import { getDb } from '../index'

export function insertSuggestion(s: {
  meetingId: number
  tMs: number
  trigger: 'ambient' | 'hotkey'
  promptWindow: string
  text: string
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO suggestions (meeting_id, t_ms, trigger, prompt_window, text)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(s.meetingId, s.tMs, s.trigger, s.promptWindow, s.text)
  return Number(res.lastInsertRowid)
}
