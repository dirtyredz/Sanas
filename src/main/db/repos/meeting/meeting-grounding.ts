import type { MeetingResume } from '@shared/meeting/meeting-resume'
import { getDb } from '../../index'

/** Everything a meeting was grounded on at Start: its immutable resume and Interview-profile
 *  snapshots. The one read both artifacts go through. */
export interface MeetingGrounding {
  resume: MeetingResume | null
  interviewProfile: string
  /** Either artifact carries text: the meeting has a candidate biography to answer from. */
  hasBiography: boolean
}

/** Both snapshots live off the shared Meeting row (up to 40k chars each) so list and
 *  search queries never ship them; callers that need them ask for them by id. */
export function getMeetingGrounding(meetingId: number): MeetingGrounding {
  const row = getDb()
    .prepare('SELECT resume_name, resume_text, interview_profile FROM meetings WHERE id = ?')
    .get(meetingId) as
    { resume_name: string; resume_text: string; interview_profile: string } | undefined
  const resume = row?.resume_text ? { name: row.resume_name, text: row.resume_text } : null
  const interviewProfile = row?.interview_profile ?? ''
  return {
    resume,
    interviewProfile,
    hasBiography: !!resume?.text.trim() || !!interviewProfile,
  }
}
