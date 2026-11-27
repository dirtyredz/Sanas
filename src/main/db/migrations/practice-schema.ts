export const practiceSchema = `
ALTER TABLE meetings ADD COLUMN practice INTEGER NOT NULL DEFAULT 0 CHECK (practice IN (0,1));
CREATE TABLE mock_results (
  meeting_id INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  result TEXT NOT NULL
);
CREATE INDEX idx_meetings_practice ON meetings(practice, started_at);
`
