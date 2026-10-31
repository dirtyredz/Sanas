import { afterEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  exit: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
  open: vi.fn(),
  probe: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.1.0', whenReady: async () => {}, exit: mock.exit },
}))
vi.mock('node:fs', () => ({ writeFileSync: mock.write }))
vi.mock('../db', () => ({ openDb: mock.open, closeDb: mock.close }))
vi.mock('../db/repos/diagnostics', () => ({ diagnosticProbe: mock.probe }))
import { runSmoke } from './smoke'
const argv = [...process.argv]
afterEach(() => {
  process.argv = [...argv]
  vi.clearAllMocks()
})
it('reports failure and closes the DB before exiting', async () => {
  process.argv.push('--smoke-report=/report.json')
  mock.open.mockRejectedValue(new Error('native ABI mismatch'))
  await runSmoke()
  await vi.waitFor(() => expect(mock.exit).toHaveBeenCalledWith(1))
  expect(mock.close).toHaveBeenCalledOnce()
  expect(JSON.parse(mock.write.mock.calls[0][1]).result).toBe('failed')
  expect(mock.probe).not.toHaveBeenCalled()
})
it('fails without a report destination before DB access', async () => {
  await runSmoke()
  expect(mock.open).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(mock.exit).toHaveBeenCalledWith(1))
})

it('reports a successful packaged native probe and closes before exit', async () => {
  process.argv.push('--smoke-report=/report.json')
  mock.open.mockResolvedValue({ pragma: () => 7 })
  const key = '/isolated/better_sqlite3.node'
  require.cache[key] = { filename: key } as NodeJS.Module
  try {
    await runSmoke()
    expect(mock.probe).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(mock.exit).toHaveBeenCalledWith(0))
    expect(JSON.parse(mock.write.mock.calls[0][1])).toMatchObject({
      packaged: true,
      version: '0.1.0',
      schemaVersion: 7,
      result: 'ok',
      bindingPath: key,
    })
    expect(mock.close.mock.invocationCallOrder[0]).toBeLessThan(
      mock.exit.mock.invocationCallOrder[0],
    )
  } finally {
    delete require.cache[key]
  }
})
