import type { Database } from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** A consistent online SQLite copy in `<userData>/backups`, uniquely named. Rejects (and the
 *  caller must abort) when the copy fails. Database only: recordings are separate files. */
export async function backupDatabase(
  db: Database,
  userData: string,
  label = 'sanas',
): Promise<string> {
  const folder = join(userData, 'backups')
  await mkdir(folder, { recursive: true })
  const path = join(folder, `${label}-${Date.now()}-${randomUUID()}.db`)
  await db.backup(path)
  return path
}

/** Startup's pre-upgrade copy, taken before migrations run. */
export function backupBeforeMigration(db: Database, userData: string): Promise<string> {
  return backupDatabase(db, userData)
}
