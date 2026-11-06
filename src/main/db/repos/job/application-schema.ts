/** v13: the link between a job and the resumes interview pack it was created from, plus the
 *  job-deletion guard.
 *
 *  `job_applications` holds one row per linked job. `application_id` is unique, so a second
 *  import of the same application (even a concurrent one) fails inside its transaction.
 *  `baseline` is versioned JSON of the source values last imported or reviewed (job fields,
 *  normalized glossary, resume name/text and per-field sources); it never holds a PDF path.
 *  The row cascades with its job, so deleting a job unlinks it and a later import is new.
 *
 *  `jobs_delete_guard` refuses to delete the default Unsorted bucket (ID 1, and any row named
 *  'Unsorted', because ensureDefaultJob resolves it by name) and any job that still has
 *  meetings. Deleting a job with history therefore has to remove its meetings first through
 *  services/meetings/remove.ts, which also deletes their recordings; a direct row delete
 *  could otherwise cascade meetings away and strand their WAV files.
 *  Frozen migration: never edit after it ships. */
export const applicationSchema = `
CREATE TABLE job_applications (
  job_id            INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  application_id    TEXT NOT NULL UNIQUE CHECK (length(application_id) BETWEEN 1 AND 128),
  source_root       TEXT NOT NULL,
  content_hash      TEXT CHECK (content_hash IS NULL OR length(content_hash) <= 256),
  fingerprint       TEXT NOT NULL,
  source_stage      TEXT NOT NULL CHECK (source_stage IN ('interview','offer','closed')),
  source_updated_at TEXT,
  imported_at       TEXT NOT NULL DEFAULT (datetime('now')),
  baseline          TEXT NOT NULL
);
CREATE TRIGGER jobs_delete_guard BEFORE DELETE ON jobs
BEGIN
  SELECT RAISE(ABORT, 'The Unsorted job cannot be deleted.')
    WHERE old.id = 1 OR old.name = 'Unsorted';
  SELECT RAISE(ABORT, 'This job still has meetings.')
    WHERE EXISTS (SELECT 1 FROM meetings WHERE job_id = old.id);
END;
`
