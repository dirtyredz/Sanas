import { expect, it } from 'vitest'
import { interviewChecked, rememberedJob, rememberJob } from './start-selection'
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
it.each(['', 9] as const)('late job loading preserves newer selection %s', async (choice) => {
  const storage = { getItem: () => '7', setItem: () => {}, removeItem: () => {} }
  let resolve!: (jobs: { id: number }[]) => void
  const loading = new Promise<{ id: number }[]>((done) => {
    resolve = done
  })
  let selection: number | '' = ''
  let changed = false
  const loaded = loading.then((jobs) => {
    selection = rememberedJob(storage, jobs, changed ? selection : undefined)
  })
  selection = choice
  changed = true
  resolve([{ id: 7 }, { id: 9 }])
  await loaded
  expect(selection).toBe(choice)
})

it('defaults Interview from the job resume and lets an explicit choice win either way', () => {
  expect(interviewChecked(undefined, true)).toBe(true)
  expect(interviewChecked(undefined, false)).toBe(false) // Unsorted / no saved resume
  expect(interviewChecked(false, true)).toBe(false)
  expect(interviewChecked(true, false)).toBe(true)
})
