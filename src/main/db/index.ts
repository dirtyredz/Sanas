import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function openDb(): Database.Database {
  if (db) return db
  const path = join(app.getPath('userData'), 'sanas.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not opened — call openDb() first')
  return db
}
