import { expect, it } from 'vitest'
import { rememberedJob, rememberJob } from './start-selection'
it('Unsorted replaces the remembered deck job across remounts', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
    removeItem: (k: string) => {
      data.delete(k)
    },
  }
  rememberJob(storage, '7')
  expect(rememberedJob(storage, [{ id: 7 }])).toBe(7)
  rememberJob(storage, '')
  expect(rememberedJob(storage, [{ id: 7 }])).toBe('')
})
