import { expect, it, vi } from 'vitest'
import { join } from 'node:path'
const mock = vi.hoisted(() => ({
  setPath: vi.fn(),
  setName: vi.fn(),
  mkdtemp: vi.fn(() => '/temp/sanas-smoke-unique'),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/appdata', setPath: mock.setPath, setName: mock.setName },
}))
vi.mock('node:fs', () => ({ mkdtempSync: mock.mkdtemp }))
import { configureUserData } from './user-data'
it('preserves dev/installed identity and isolates smoke', () => {
  expect(configureUserData(false)).toBe(join('/appdata', 'sanas'))
  expect(mock.mkdtemp).not.toHaveBeenCalled()
  expect(configureUserData(true)).toBe('/temp/sanas-smoke-unique')
  expect(mock.setName).toHaveBeenCalledWith('sanas')
  expect(mock.setPath).toHaveBeenLastCalledWith('userData', '/temp/sanas-smoke-unique')
})
