import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'node:fs'
import { runMigrations, schemaVersion } from './migrations'
import { backupBeforeMigration } from './backup'

let db: Database.Database | null = null

let opening: Promise<Database.Database> | null = null

export function openDb(): Promise<Database.Database> {
  if (db) return Promise.resolve(db)
  if (opening) return opening
  opening = initialize().finally(() => {
    opening = null
  })
  return opening
}

async function initialize(): Promise<Database.Database> {
  const folder = app.getPath('userData')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, 'sanas.db')
  const existed = existsSync(path)
  const candidate = new Database(path)
  let backup: string | undefined
  let future = false
  try {
    const current = candidate.pragma('user_version', { simple: true }) as number
    future = current > schemaVersion
    if (future) throw new Error('This database needs a newer version of Sanas.')
    if (existed && current < schemaVersion) backup = await backupBeforeMigration(candidate, folder)
    candidate.pragma('journal_mode = WAL')
    candidate.pragma('foreign_keys = ON')
    runMigrations(candidate)
    db = candidate
    return candidate
  } catch (error) {
    candidate.close()
    throw new Error(
      `Database initialization failed.${future ? ' This database needs a newer version of Sanas.' : ''} No replacement was created.${backup ? ` Backup: ${backup}` : ' Check the backups directory before recovery.'}`,
      { cause: error },
    )
  }
}

export function closeDb(): void {
  db?.close()
  db = null
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not opened — call openDb() first')
  return db
}
