import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({
  packaged: true,
  initialize: vi.fn(),
  check: vi.fn(),
  install: vi.fn(),
  broadcast: vi.fn(),
  updater: {} as Record<string, unknown>,
}))
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mock.packaged
    },
    getVersion: () => '0.1.0',
  },
}))
vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      mock.initialize()
      return mock.updater
    },
  },
}))
vi.mock('../../windows/broadcast', () => ({ broadcast: mock.broadcast }))
let events: EventEmitter
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  mock.packaged = true
  events = new EventEmitter()
  mock.updater = Object.assign(events, {
    checkForUpdates: mock.check,
    quitAndInstall: mock.install,
  }) as unknown as Record<string, unknown>
  mock.check.mockResolvedValue(null)
})
afterEach(() => {
  vi.useRealTimers()
})
it('checks on launch/every six hours, deduplicates and never installs on download or ordinary quit', async () => {
  const service = await import('./service')
  service.startUpdates()
  service.startUpdates()
  await service.checkForUpdates()
  expect(mock.check).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
  expect(mock.check).toHaveBeenCalledTimes(2)
  expect(mock.updater).toMatchObject({
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    allowPrerelease: false,
  })
  events.emit('update-downloaded', { version: '0.1.1' })
  expect(service.getUpdateState().canRestart).toBe(true)
  expect(mock.install).not.toHaveBeenCalled()
  service.restartToUpdate()
  service.restartToUpdate()
  expect(mock.install).toHaveBeenCalledOnce()
  expect(mock.updater.autoInstallOnAppQuit).toBe(false)
  service.stopUpdates()
  expect(vi.getTimerCount()).toBe(0)
})
it('sanitizes network errors and permits retry', async () => {
  mock.check.mockRejectedValueOnce(new Error('secret token C:/private'))
  const service = await import('./service')
  service.startUpdates()
  const state = await service.checkForUpdates()
  expect(state.phase).toBe('error')
  expect(state.error).not.toMatch('secret|private')
  await service.checkForUpdates()
  expect(mock.check).toHaveBeenCalledTimes(2)
  service.stopUpdates()
})
it('development initializes no updater or timers', async () => {
  mock.packaged = false
  const service = await import('./service')
  service.startUpdates()
  await service.checkForUpdates()
  expect(mock.check).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  expect(service.getUpdateState().phase).toBe('disabled')
  expect(mock.initialize).not.toHaveBeenCalled()
})
it('installation errors remain recoverable without install-on-quit', async () => {
  const service = await import('./service')
  service.startUpdates()
  await service.checkForUpdates()
  events.emit('update-downloaded', { version: '0.1.1' })
  mock.install.mockImplementationOnce(() => {
    throw new Error('failed')
  })
  expect(service.restartToUpdate().error).toMatch('try again')
  expect(service.restartToUpdate().phase).toBe('installing')
  service.stopUpdates()
})

it('smoke initializes no updater even when packaged', async () => {
  process.argv.push('--smoke')
  try {
    const service = await import('./service')
    service.startUpdates()
    expect(mock.check).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    process.argv.splice(process.argv.lastIndexOf('--smoke'), 1)
  }
})
it('preserves recoverable error state when installer emits error synchronously', async () => {
  const service = await import('./service')
  service.startUpdates()
  await service.checkForUpdates()
  events.emit('update-downloaded', { version: '0.1.1' })
  mock.install.mockImplementationOnce(() => {
    events.emit('error', new Error('private path'))
  })
  expect(service.restartToUpdate()).toMatchObject({ phase: 'downloaded', canRestart: true })
  expect(service.restartToUpdate().phase).toBe('installing')
  service.stopUpdates()
})
