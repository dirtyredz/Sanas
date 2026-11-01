import { beforeEach, expect, it, vi } from 'vitest'
import { join } from 'node:path'
const mock = vi.hoisted(() => ({
  setPath: vi.fn(),
  setName: vi.fn(),
  mkdtemp: vi.fn(() => '/temp/sanas-smoke-unique'),
  packaged: false,
}))
vi.mock('electron', () => ({
  app: {
    getPath: () => '/appdata',
    setPath: mock.setPath,
    setName: mock.setName,
    get isPackaged() {
      return mock.packaged
    },
  },
}))
vi.mock('node:fs', () => ({ mkdtempSync: mock.mkdtemp }))
import { configureUserData } from './user-data'
beforeEach(() => {
  mock.packaged = false
  vi.clearAllMocks()
})
it('preserves dev/installed identity and isolates smoke', () => {
  expect(configureUserData(false, [])).toBe(join('/appdata', 'sanas'))
  expect(mock.mkdtemp).not.toHaveBeenCalled()
  expect(configureUserData(true, [])).toBe('/temp/sanas-smoke-unique')
  expect(configureUserData(true, ['--smoke-user-data=/owned/smoke'])).toBe('/owned/smoke')
  expect(mock.setName).toHaveBeenCalledWith('sanas')
  expect(mock.setPath).toHaveBeenLastCalledWith('userData', '/owned/smoke')
})
it('lets an unpackaged run use a throwaway profile, never a packaged one', () => {
  expect(configureUserData(false, ['--dev-user-data=/scratch/profile'])).toBe('/scratch/profile')
  mock.packaged = true
  expect(configureUserData(false, ['--dev-user-data=/scratch/profile'])).toBe(
    join('/appdata', 'sanas'),
  )
})
