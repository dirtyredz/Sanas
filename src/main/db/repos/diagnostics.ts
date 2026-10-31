import { getDb } from '..'

export function diagnosticProbe(): void {
  const db = getDb()
  db.transaction(() => {
    const result = db.prepare('INSERT INTO jobs (name) VALUES (?)').run('diagnostic probe')
    const row = db.prepare('SELECT name FROM jobs WHERE id = ?').get(result.lastInsertRowid) as {
      name: string
    }
    if (row.name !== 'diagnostic probe') throw new Error('Probe read failed')
    db.prepare('DELETE FROM jobs WHERE id = ?').run(result.lastInsertRowid)
  })()
  if (db.pragma('integrity_check', { simple: true }) !== 'ok')
    throw new Error('Integrity check failed')
}
