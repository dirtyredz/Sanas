/** v11: one optional saved resume per job (extracted text and display name only; never the
 *  source binary or path). No row means no resume. Start copies it onto the meeting row, whose
 *  own v9 snapshot stays immutable, so editing or removing this never rewrites history.
 *  Frozen migration: the 40000 mirrors RESUME_MAX_CHARS when it shipped. */
export const jobResumeSchema = `
CREATE TABLE job_resumes (
  job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 40000)
);
`
