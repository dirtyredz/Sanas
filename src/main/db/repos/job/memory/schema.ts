export const jobMemorySchema = `
CREATE TABLE job_memory (
  job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '' CHECK(length(text) <= 3000),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE job_memory_proposals (
  meeting_id INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  generation TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '' CHECK(length(text) <= 3000),
  status TEXT NOT NULL CHECK(status IN ('pending','generating','failed','stale','approved','dismissed'))
);
CREATE INDEX job_memory_proposals_job ON job_memory_proposals(job_id);
`
