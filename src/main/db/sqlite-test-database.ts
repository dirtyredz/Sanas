import { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'

/** Real local SQLite for repository tests; not an Electron ABI check. */
export function sqliteTestDatabase(): { sqlite: DatabaseSync; db: Database } {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  // Exercise actual SQLite SQL/transactions with Node's local binding; no Electron launch.
  const db = {
    prepare: (sql: string) => sqlite.prepare(sql),
    exec: (sql: string) => sqlite.exec(sql),
    pragma: (sql: string, opts?: { simple: boolean }) => {
      if (opts?.simple) return Object.values(sqlite.prepare(`PRAGMA ${sql}`).get()!)[0]
      sqlite.exec(`PRAGMA ${sql}`)
    },
    transaction: (fn: () => unknown) => () => {
      sqlite.exec('BEGIN')
      try {
        const result = fn()
        sqlite.exec('COMMIT')
        return result
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  } as unknown as Database
  return { sqlite, db }
}
