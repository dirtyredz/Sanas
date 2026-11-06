import { expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn().mockResolvedValue(undefined) }))
import { backupBeforeMigration, backupDatabase } from './backup'
it('uses unique backups and propagates SQLite backup failure', async () => {
  const backup = vi.fn().mockResolvedValue(undefined)
  const db = { backup } as unknown as Database
  const a = await backupBeforeMigration(db, '/isolated')
  const b = await backupBeforeMigration(db, '/isolated')
  expect(a).not.toBe(b)
  expect(a).toContain('backups')
  backup.mockRejectedValue(new Error('disk full'))
  await expect(backupBeforeMigration(db, '/isolated')).rejects.toThrow('disk full')
})
it('labels on-demand backups and rejects when the copy fails', async () => {
  const backup = vi.fn().mockResolvedValue(undefined)
  const db = { backup } as unknown as Database
  expect(await backupDatabase(db, '/isolated', 'before-job-delete')).toMatch(
    /backups.before-job-delete-\d+-/,
  )
  backup.mockRejectedValue(new Error('locked'))
  await expect(backupDatabase(db, '/isolated', 'x')).rejects.toThrow('locked')
})
