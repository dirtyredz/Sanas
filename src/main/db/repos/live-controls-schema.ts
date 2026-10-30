// Rebuild children before parents, with foreign keys enabled throughout the transaction.
export const liveControlsSchema = `
CREATE TABLE meeting_deck_versions (
 meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version >= 0), PRIMARY KEY(meeting_id, version)
);
INSERT INTO meeting_deck_versions SELECT id, 0 FROM meetings;
CREATE TABLE meeting_slides_v7 (
 meeting_id INTEGER NOT NULL, deck_version INTEGER NOT NULL,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
 title TEXT NOT NULL, talking_point TEXT NOT NULL, script TEXT NOT NULL, key_facts TEXT NOT NULL,
 PRIMARY KEY(meeting_id, deck_version, ordinal),
 FOREIGN KEY(meeting_id, deck_version) REFERENCES meeting_deck_versions(meeting_id, version) ON DELETE CASCADE
);
INSERT INTO meeting_slides_v7 SELECT meeting_id, 0, ordinal, title, talking_point, script, key_facts FROM meeting_slides;
CREATE TABLE meeting_slide_events_v7 (
 meeting_id INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
 deck_version INTEGER NOT NULL, ordinal INTEGER, t_ms INTEGER NOT NULL CHECK(t_ms >= 0),
 PRIMARY KEY(meeting_id, revision),
 FOREIGN KEY(meeting_id, deck_version) REFERENCES meeting_deck_versions(meeting_id, version) ON DELETE CASCADE,
 FOREIGN KEY(meeting_id, deck_version, ordinal) REFERENCES meeting_slides_v7(meeting_id, deck_version, ordinal)
);
INSERT INTO meeting_slide_events_v7 SELECT meeting_id, revision, 0, ordinal, t_ms FROM meeting_slide_events;
DROP TABLE meeting_slide_events;
DROP TABLE meeting_slides;
ALTER TABLE meeting_slides_v7 RENAME TO meeting_slides;
ALTER TABLE meeting_slide_events_v7 RENAME TO meeting_slide_events;
CREATE TABLE meeting_context_revisions (
 meeting_id INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0),
 text TEXT NOT NULL, deck_version INTEGER NOT NULL, t_ms INTEGER NOT NULL CHECK(t_ms >= 0),
 PRIMARY KEY(meeting_id, revision),
 FOREIGN KEY(meeting_id, deck_version) REFERENCES meeting_deck_versions(meeting_id, version) ON DELETE CASCADE
);
INSERT INTO meeting_context_revisions SELECT id, 0, '', 0, 0 FROM meetings;
CREATE TABLE suggestion_grounding_contexts (
 id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 deck_version INTEGER NOT NULL, system TEXT NOT NULL, deck_context TEXT NOT NULL,
 FOREIGN KEY(meeting_id, deck_version) REFERENCES meeting_deck_versions(meeting_id, version) ON DELETE CASCADE,
 UNIQUE(meeting_id, deck_version, system, deck_context)
);
ALTER TABLE suggestions ADD COLUMN grounding_context_id INTEGER REFERENCES suggestion_grounding_contexts(id);
ALTER TABLE suggestions ADD COLUMN context_revision INTEGER;
ALTER TABLE suggestions ADD COLUMN source_suggestion_id INTEGER REFERENCES suggestions(id);
ALTER TABLE suggestions ADD COLUMN request_text TEXT;
ALTER TABLE suggestions ADD COLUMN manual_kind TEXT CHECK(manual_kind IN ('typed','detail','audience'));
`
