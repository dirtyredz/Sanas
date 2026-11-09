import type { Database } from 'better-sqlite3'

/** Isolated synthetic corpus only; called by the explicit fixture benchmark. */
export function createLatencyFixture(db: Database, count: number): void {
  db.exec(
    "INSERT INTO jobs(id,name) VALUES(1,'Fixture job'); INSERT INTO meetings(id,job_id,title,ended_at,summary) VALUES(1,1,'Synthetic history','2026-11-01','Summaryonly milestone 42'),(2,1,'Current',NULL,NULL)",
  )
  const insert = db.prepare(
    'INSERT INTO segments(meeting_id,t_start_ms,t_end_ms,speaker,text) VALUES(1,?,?,1,?)',
  )
  db.transaction(() => {
    for (let i = 0; i < count; i++)
      insert.run(i * 1000, i * 1000 + 500, `Common platform budget status fixture${i} value ${i}`)
  })()
}
