/** The slice of a better-sqlite3 handle the gate needs: `pragma` returns rows without `simple`. */
interface PragmaReader {
  pragma(source: string): unknown
}

/**
 * Read-only structural gate run on an existing database before any backup or migration.
 * `quick_check` and `foreign_key_check` only read; a failure refuses to start, and nothing is repaired,
 * deleted or restored automatically (a damaged main/WAL pair must be inspected by the owner first).
 * Distinct from repos/diagnostics.ts, the write-bearing packaged-smoke probe.
 */
export function assertDatabaseHealthy(db: PragmaReader): void {
  const problems: string[] = []
  for (const row of rows(db.pragma('quick_check'))) {
    const message = String(Object.values(row)[0])
    if (message !== 'ok') problems.push(message)
  }
  const orphans = rows(db.pragma('foreign_key_check')).length
  if (orphans > 0) problems.push(`${orphans} foreign-key violation(s)`)
  if (problems.length === 0) return
  throw new Error(
    `The database failed its integrity check (${problems.slice(0, 3).join('; ')}). ` +
      'Sanas did not migrate or modify it. Keep sanas.db and its -wal/-shm files together, ' +
      'check the backups folder, and recover manually.',
  )
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}
