import { expect, it } from 'vitest'
import type { Job } from '@shared/types'
import { rememberedJob, rememberJob, selectionAfterReload, startableJobs } from './job-choices'

const job = (id: number, name: string): Job => ({
  id,
  name,
  companyInfo: '',
  projectScope: '',
  notes: '',
  talkingPoints: '',
  persona: '',
  summaryEmail: '',
  createdAt: '',
  archived: false,
})
const store = (id?: string) => ({
  getItem: () => id ?? null,
  setItem: () => {},
  removeItem: () => {},
})
const owner = [job(1, 'Unsorted'), job(2, 'Centene'), job(3, 'Constellation')]

it('drops the Unsorted bucket row so the picker lists Unsorted once', () => {
  expect(startableJobs(owner).map((j) => j.name)).toEqual(['Centene', 'Constellation'])
})

const reload = (all: Job[], remembered: string | undefined, newer?: number | '') =>
  selectionAfterReload(store(remembered), startableJobs(all), newer)

it('a reload after a job is created keeps the selection', () => {
  const before = reload(owner, '2')
  expect(before).toBe(2)
  expect(reload([...owner, job(4, 'Ten Mile Square')], '2', before)).toBe(2)
})

it('drops a deleted job (and its remembered choice) on the next visible reload', () => {
  const before = reload(owner, '3')
  expect(before).toBe(3)
  expect(reload(owner.slice(0, 2), '3', before)).toBe('')
})

it('falls back to Unsorted when the selected job was archived or is the bucket row', () => {
  expect(reload(owner.slice(0, 2), undefined, 3)).toBe('')
  expect(reload(owner, '1')).toBe('')
  expect(reload(owner, undefined, 1)).toBe('')
})

it('a job named like the bucket is only ever the bucket', () => {
  expect(startableJobs([job(9, 'Unsorted'), job(10, 'Unsorted 2')]).map((j) => j.id)).toEqual([10])
})

it('Unsorted replaces the remembered job across remounts', () => {
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
