import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  version: 6,
  exists: true,
  backup: vi.fn(),
  migrate: vi.fn(),
  close: vi.fn(),
  pragma: vi.fn(),
}))
vi.mock('electron', () => ({ app: { getPath: () => '/isolated' } }))
vi.mock('node:fs', () => ({ existsSync: () => mock.exists, mkdirSync: vi.fn() }))
vi.mock('better-sqlite3', () => ({
  default: class {
    pragma = mock.pragma
    close = mock.close
  },
}))
vi.mock('./migrations', () => ({ schemaVersion: 7, runMigrations: mock.migrate }))
vi.mock('./backup', () => ({ backupBeforeMigration: mock.backup }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.version = 6
  mock.exists = true
  mock.pragma.mockImplementation((q: string) => (q === 'user_version' ? mock.version : undefined))
  mock.backup.mockResolvedValue('/isolated/backups/pre-upgrade.db')
  mock.migrate.mockImplementation(() => {})
})
it('awaits backup before migrations and exposes no handle until success; deduplicates open', async () => {
  let finish!: (value: string) => void
  mock.backup.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const db = await import('./index')
  const pending = db.openDb()
  expect(db.openDb()).toBe(pending)
  expect(() => db.getDb()).toThrow()
  expect(mock.migrate).not.toHaveBeenCalled()
  finish('/backup')
  expect(await pending).toBe(db.getDb())
  expect(mock.migrate).toHaveBeenCalledOnce()
  db.closeDb()
  expect(mock.close).toHaveBeenCalledOnce()
  expect(() => db.getDb()).toThrow()
})
it('aborts and closes when backup fails', async () => {
  mock.backup.mockRejectedValue(new Error('disk full'))
  const db = await import('./index')
  await expect(db.openDb()).rejects.toThrow('initialization failed')
  expect(mock.migrate).not.toHaveBeenCalled()
  expect(mock.close).toHaveBeenCalledOnce()
  expect(() => db.getDb()).toThrow()
})
it('rejects future schemas before backup or migration', async () => {
  mock.version = 8
  const db = await import('./index')
  await expect(db.openDb()).rejects.toThrow()
  expect(mock.backup).not.toHaveBeenCalled()
  expect(mock.migrate).not.toHaveBeenCalled()
  expect(mock.close).toHaveBeenCalledOnce()
})
it('reports the backup on migration failure and can retry', async () => {
  mock.migrate.mockImplementationOnce(() => {
    throw new Error('migration failed')
  })
  const db = await import('./index')
  await expect(db.openDb()).rejects.toThrow('/isolated/backups/pre-upgrade.db')
  expect(() => db.getDb()).toThrow()
  await db.openDb()
  expect(db.getDb()).toBeTruthy()
})
it.each([
  { exists: false, version: 0 },
  { exists: true, version: 7 },
])('does not back up fresh/current DB: %o', async ({ exists, version }) => {
  mock.exists = exists
  mock.version = version
  await (await import('./index')).openDb()
  expect(mock.backup).not.toHaveBeenCalled()
})
