import { expect, it } from 'vitest'
import { interviewAfterAttachment, rememberedJob, rememberJob } from './start-selection'
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

const resume = { name: 'Resume', text: 'Java' }
it('enables Interview on attachment and preserves explicit off while editing or removing it', () => {
  expect(interviewAfterAttachment(false, null, resume)).toBe(true)
  expect(interviewAfterAttachment(false, resume, { ...resume, text: 'TypeScript' })).toBe(false)
  expect(interviewAfterAttachment(false, resume, null)).toBe(false)
  expect(interviewAfterAttachment(true, resume, null)).toBe(true)
})
