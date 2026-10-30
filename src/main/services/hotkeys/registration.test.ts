import { expect, it, vi } from 'vitest'
import { registerShortcuts } from './registration'
const settings = {
  overlayHotkey: 'A',
  assistHotkey: 'B',
  presentationPrevHotkey: 'C',
  presentationNextHotkey: 'D',
}
it('reports occupied, duplicate and invalid accelerators', () => {
  const callbacks = {
    overlayHotkey: vi.fn(),
    assistHotkey: vi.fn(),
    presentationPrevHotkey: vi.fn(),
    presentationNextHotkey: vi.fn(),
  }
  const status = registerShortcuts(
    (key) => {
      if (key === 'C') throw new Error('invalid')
      return false
    },
    { ...settings, assistHotkey: 'a' },
    callbacks,
    vi.fn(),
  )
  expect(status.map((s) => s.registered)).toEqual([false, false, false, false])
  expect(status[1].error).toBe('Duplicate shortcut.')
  expect(status[2].error).toBe('invalid')
})
it('suppresses repeats and contains synchronous and asynchronous callback failures', async () => {
  const registered: (() => void)[] = []
  let now = 0
  const report = vi.fn()
  const next = vi.fn()
  registerShortcuts(
    (_key, cb) => {
      registered.push(cb)
      return true
    },
    settings,
    {
      overlayHotkey: () => {
        throw new Error('sync')
      },
      assistHotkey: async () => {
        throw new Error('async')
      },
      presentationPrevHotkey: next,
      presentationNextHotkey: next,
    },
    report,
    () => now,
  )
  registered[2]()
  registered[3]()
  now = 200
  registered[3]()
  expect(next).toHaveBeenCalledTimes(2)
  registered[0]()
  registered[1]()
  await Promise.resolve()
  expect(report).toHaveBeenCalledTimes(2)
})
