import type { MeetingResume } from '@shared/meeting-resume'
import { getDb } from '../index'

/** The saved resume lives off the shared Meeting row (up to 40k chars) so list and
 *  search queries never ship it; callers that need it ask for it by id. */
export function getMeetingResume(meetingId: number): MeetingResume | null {
  const row = getDb()
    .prepare('SELECT resume_name, resume_text FROM meetings WHERE id = ?')
    .get(meetingId) as { resume_name: string; resume_text: string } | undefined
  return row?.resume_text ? { name: row.resume_name, text: row.resume_text } : null
}
