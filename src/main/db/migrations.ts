import type { Database } from 'better-sqlite3'

// Append-only list; each entry runs once, tracked via user_version pragma.
const migrations: string[] = [
  // v1 — initial schema (see docs/ARCHITECTURE.md)
  `
  CREATE TABLE jobs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    company_info   TEXT NOT NULL DEFAULT '',
    project_scope  TEXT NOT NULL DEFAULT '',
    notes          TEXT NOT NULL DEFAULT '',
    talking_points TEXT NOT NULL DEFAULT '',
    persona        TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    archived       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE glossary (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    term   TEXT NOT NULL,
    note   TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE meetings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    title        TEXT NOT NULL DEFAULT '',
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at     TEXT,
    audio_path   TEXT,
    summary      TEXT,
    action_items TEXT
  );
  CREATE TABLE segments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    t_start_ms INTEGER NOT NULL,
    t_end_ms   INTEGER NOT NULL,
    speaker    INTEGER NOT NULL,
    is_user    INTEGER NOT NULL DEFAULT 0,
    text       TEXT NOT NULL
  );
  CREATE INDEX idx_segments_meeting ON segments(meeting_id, t_start_ms);
  CREATE TABLE suggestions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id    INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    t_ms          INTEGER NOT NULL,
    trigger       TEXT NOT NULL CHECK (trigger IN ('ambient','hotkey')),
    prompt_window TEXT NOT NULL DEFAULT '',
    text          TEXT NOT NULL
  );
  `,
  // v2 — user-assigned speaker names per meeting
  `
  CREATE TABLE speakers (
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    PRIMARY KEY (meeting_id, speaker)
  );
  `,
  // v3 — per-job recipient for summary emails
  `ALTER TABLE jobs ADD COLUMN summary_email TEXT NOT NULL DEFAULT '';`,
  // v4 — full-text index over transcript segments (Search ranking, Ask retrieval).
  // External-content table: text stays in segments; triggers keep the index current.
  `
  CREATE VIRTUAL TABLE segments_fts USING fts5(
    text, content='segments', content_rowid='id', tokenize='porter unicode61'
  );
  INSERT INTO segments_fts(rowid, text) SELECT id, text FROM segments;
  CREATE TRIGGER segments_fts_ai AFTER INSERT ON segments BEGIN
    INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER segments_fts_ad AFTER DELETE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;
  CREATE TRIGGER segments_fts_au AFTER UPDATE OF text ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
  END;
  `,
]

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
