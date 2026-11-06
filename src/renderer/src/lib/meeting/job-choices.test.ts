import { expect, it } from 'vitest'
import type { Job } from '@shared/types'
import { applyJobList, startableJobs } from './job-choices'

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

it('a reload after a job is created offers the new job and keeps the selection', () => {
  const before = applyJobList(store('2'), owner)
  expect(before.jobId).toBe(2)
  const after = applyJobList(store('2'), [...owner, job(4, 'Ten Mile Square')], before.jobId)
  expect(after.jobs.map((j) => j.name)).toContain('Ten Mile Square')
  expect(after.jobId).toBe(2)
})

it('drops a deleted job (and its remembered choice) on the next visible reload', () => {
  const before = applyJobList(store('3'), owner)
  expect(before.jobId).toBe(3)
  const after = applyJobList(store('3'), owner.slice(0, 2), before.jobId)
  expect(after.jobs.map((j) => j.id)).toEqual([2])
  expect(after.jobId).toBe('')
})

it('falls back to Unsorted when the selected job was archived or is the bucket row', () => {
  expect(applyJobList(store(), owner.slice(0, 2), 3).jobId).toBe('')
  expect(applyJobList(store('1'), owner).jobId).toBe('')
  expect(applyJobList(store(), owner, 1).jobId).toBe('')
})
