import Database from 'better-sqlite3'

/** A second, read-only connection to the existing database file (e.g. for a worker thread).
 *  It cannot write, create the file, or wait long on a busy writer. */
export function openReadOnlyConnection(path: string): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 1 })
  db.pragma('query_only = ON')
  return db
}
