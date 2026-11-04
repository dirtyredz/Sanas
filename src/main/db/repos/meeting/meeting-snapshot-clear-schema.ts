/** v12: the one sanctioned way to remove a meeting's resume / interview-profile snapshot —
 *  moving the meeting to a different job (the snapshot came from the wrong job). The
 *  immutability triggers still reject every edit, and every clear that is not to empty text
 *  or not announced by a row in `meeting_snapshot_clear` (written and removed by
 *  `moveMeetingToJob` inside its transaction). Idempotent: re-runs after a test downgrade. */
export const meetingSnapshotClearSchema = `
  CREATE TABLE IF NOT EXISTS meeting_snapshot_clear (meeting_id INTEGER PRIMARY KEY);
  DROP TRIGGER IF EXISTS meetings_resume_immutable;
  CREATE TRIGGER meetings_resume_immutable
  BEFORE UPDATE OF resume_name, resume_text ON meetings
  WHEN (NEW.resume_name != OLD.resume_name OR NEW.resume_text != OLD.resume_text)
    AND NOT (NEW.resume_name = '' AND NEW.resume_text = ''
      AND EXISTS (SELECT 1 FROM meeting_snapshot_clear WHERE meeting_id = OLD.id))
  BEGIN
    SELECT RAISE(ABORT, 'Meeting resume is immutable');
  END;
  DROP TRIGGER IF EXISTS meetings_interview_profile_immutable;
  CREATE TRIGGER meetings_interview_profile_immutable
  BEFORE UPDATE OF interview_profile ON meetings
  WHEN NEW.interview_profile != OLD.interview_profile
    AND NOT (NEW.interview_profile = ''
      AND EXISTS (SELECT 1 FROM meeting_snapshot_clear WHERE meeting_id = OLD.id))
  BEGIN
    SELECT RAISE(ABORT, 'Meeting interview profile is immutable');
  END;
`
