import type { Database } from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function backupBeforeMigration(db: Database, userData: string): Promise<string> {
  const folder = join(userData, 'backups')
  await mkdir(folder, { recursive: true })
  const path = join(folder, `sanas-${Date.now()}-${randomUUID()}.db`)
  await db.backup(path)
  return path
}
