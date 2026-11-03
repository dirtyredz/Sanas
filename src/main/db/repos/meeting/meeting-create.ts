import type { MeetingResume } from '@shared/meeting-resume'
import { getDb } from '../../index'
import { hasPresentation, insertSlideEvent } from './meeting-presentation'

/** What the meetings service hands the repo: the renderer's choices (minus `interview`,
 *  which only selects the profile) plus the Interview-profile snapshot main resolved from
 *  Settings at Start. A renderer-supplied profile has no way into this shape. */
export interface MeetingCreateInput {
  practice?: boolean
  usePresentationDeck?: boolean
  resume?: MeetingResume | null
  interviewProfile?: string
}

/** The only meeting-creation path: the row, its version/revision bookkeeping and the
 *  opt-in copy of the job's slide deck land in one transaction. */
export function createMeeting(
  jobId: number,
  title: string,
  input: MeetingCreateInput = {},
): number {
  const { practice = false, usePresentationDeck = false, resume = null } = input
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
    db.prepare("INSERT INTO meeting_context_revisions VALUES (?, 0, '', 0, 0)").run(id)
    if (usePresentationDeck) copyJobDeck(id, jobId)
    if (hasPresentation(id)) insertSlideEvent(id, { ordinal: 0, revision: 1, tMs: 0 })
    return id
  })()
}

function copyJobDeck(meetingId: number, jobId: number): void {
  getDb()
    .prepare(
      'INSERT INTO meeting_slides SELECT ?, 0, ordinal, title, talking_point, script, key_facts FROM job_slides WHERE job_id = ?',
    )
    .run(meetingId, jobId)
}
