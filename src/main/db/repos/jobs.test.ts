import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../migrations'
import { createJob, ensureDefaultJob, getJob, updateJob } from './jobs'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
}
afterEach(() => sqlite?.close())

function asEdit(id: number, name: string) {
  const { createdAt: _c, archived: _a, ...rest } = getJob(id)!
  return { ...rest, name }
}

it('reserves the Unsorted name: no other job may take it, and the bucket cannot be renamed', () => {
  database()
  expect(() => createJob('Unsorted')).toThrow(/reserved/)
  const acme = createJob('Acme').id
  expect(() => updateJob(asEdit(acme, 'Unsorted'))).toThrow(/reserved/)
  const bucket = ensureDefaultJob()
  expect(() => updateJob(asEdit(bucket, 'Misc'))).toThrow(/cannot be renamed/)
  expect(updateJob(asEdit(bucket, 'Unsorted')).name).toBe('Unsorted')
  expect(ensureDefaultJob()).toBe(bucket)
})
