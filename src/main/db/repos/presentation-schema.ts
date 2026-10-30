export const presentationSchema = `
CREATE TABLE job_slides (
 job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
 title TEXT NOT NULL, talking_point TEXT NOT NULL, script TEXT NOT NULL, key_facts TEXT NOT NULL,
 PRIMARY KEY(job_id, ordinal)
);
CREATE TABLE meeting_slides (
 meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
 title TEXT NOT NULL, talking_point TEXT NOT NULL, script TEXT NOT NULL, key_facts TEXT NOT NULL,
 PRIMARY KEY(meeting_id, ordinal)
);
CREATE TABLE meeting_slide_events (
 meeting_id INTEGER NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 ordinal INTEGER NOT NULL,
 t_ms INTEGER NOT NULL CHECK(t_ms >= 0),
 PRIMARY KEY(meeting_id, revision),
 FOREIGN KEY(meeting_id, ordinal) REFERENCES meeting_slides(meeting_id, ordinal) ON DELETE CASCADE
);`
