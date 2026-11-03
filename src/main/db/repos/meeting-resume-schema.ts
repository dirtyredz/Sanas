/** v9: extracted text and display name only. No update path, even after filing. */
export const meetingResumeSchema = `
  ALTER TABLE meetings ADD COLUMN resume_name TEXT NOT NULL DEFAULT '';
  ALTER TABLE meetings ADD COLUMN resume_text TEXT NOT NULL DEFAULT ''
    CHECK (length(resume_text) <= 40000);
  CREATE TRIGGER meetings_resume_immutable
  BEFORE UPDATE OF resume_name, resume_text ON meetings
  WHEN NEW.resume_name != OLD.resume_name OR NEW.resume_text != OLD.resume_text
  BEGIN
    SELECT RAISE(ABORT, 'Meeting resume is immutable');
  END;
`
