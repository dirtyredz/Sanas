import type { MeetingResume } from '@shared/meeting/meeting-resume'
import { getDb } from '../../index'

/** What the meetings service hands the repo: the renderer's choices (minus `interview`,
 *  which only selects the profile) plus the Interview-profile snapshot main resolved from
 *  Settings at Start. A renderer-supplied profile has no way into this shape. */
export interface MeetingCreateInput {
  practice?: boolean
  /** Context entered before Start; saved as revision 0 (validated at IPC ingress). */
  meetingContext?: string
  resume?: MeetingResume | null
  interviewProfile?: string
}

/** The only meeting-creation path: the row, the version-0 bookkeeping row and the revision-0
 *  meeting context land in one transaction. The `meeting_deck_versions` row is kept only
 *  because context revisions and saved answer grounding reference it; no slides are written
 *  (presentation mode was retired 2026-11-04). */
export function createMeeting(
  jobId: number,
  title: string,
  input: MeetingCreateInput = {},
): number {
  const { practice = false, resume = null } = input
  const db = getDb()
  return db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO meetings (job_id, title, practice, resume_name, resume_text, interview_profile) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        jobId,
        title,
        practice ? 1 : 0,
        resume?.name ?? '',
        resume?.text ?? '',
        input.interviewProfile ?? '',
      )
    const id = Number(res.lastInsertRowid)
    db.prepare('INSERT INTO meeting_deck_versions VALUES (?, 0)').run(id)
    db.prepare('INSERT INTO meeting_context_revisions VALUES (?, 0, ?, 0, 0)').run(
      id,
      input.meetingContext ?? '',
    )
    return id
  })()
}
