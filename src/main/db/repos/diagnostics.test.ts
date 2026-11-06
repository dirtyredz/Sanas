import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('..', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../migrations'
import { diagnosticProbe } from './diagnostics'

let sqlite: DatabaseSync
afterEach(() => sqlite?.close())

it('probes a fresh v13 database (where the probe row would be protected job ID 1) and leaves nothing behind', () => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  expect(() => diagnosticProbe()).not.toThrow()
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 0 })
  expect(() => diagnosticProbe()).not.toThrow() // repeatable
})
