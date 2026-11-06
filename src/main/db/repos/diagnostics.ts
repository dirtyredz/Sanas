import { getDb } from '..'

/** Thrown inside the probe transaction so it always rolls back. */
class ProbeRollback extends Error {}

/** Write/read round trip that leaves nothing behind: the probe row is rolled back rather than
 *  deleted, because on a fresh database it is job ID 1, which the v13 jobs_delete_guard
 *  trigger refuses to delete. */
export function diagnosticProbe(): void {
  const db = getDb()
  try {
    db.transaction(() => {
      const result = db.prepare('INSERT INTO jobs (name) VALUES (?)').run('diagnostic probe')
      const row = db.prepare('SELECT name FROM jobs WHERE id = ?').get(result.lastInsertRowid) as {
        name: string
      }
      if (row.name !== 'diagnostic probe') throw new Error('Probe read failed')
      throw new ProbeRollback()
    })()
  } catch (e) {
    if (!(e instanceof ProbeRollback)) throw e
  }
  if (db.pragma('integrity_check', { simple: true }) !== 'ok')
    throw new Error('Integrity check failed')
}
