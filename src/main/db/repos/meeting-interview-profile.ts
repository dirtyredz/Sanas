import { getDb } from '../index'

/** v10: independent of the mutable Settings profile; old meetings have no profile. */
export const meetingInterviewProfileSchema = `
  ALTER TABLE meetings ADD COLUMN interview_profile TEXT NOT NULL DEFAULT ''
    CHECK (length(interview_profile) <= 40000);
  CREATE TRIGGER meetings_interview_profile_immutable
  BEFORE UPDATE OF interview_profile ON meetings
  WHEN NEW.interview_profile != OLD.interview_profile
  BEGIN
    SELECT RAISE(ABORT, 'Meeting interview profile is immutable');
  END;
`

export function getMeetingInterviewProfile(meetingId: number): string {
  const row = getDb()
    .prepare('SELECT interview_profile FROM meetings WHERE id = ?')
    .get(meetingId) as { interview_profile: string } | undefined
  return row?.interview_profile ?? ''
}
