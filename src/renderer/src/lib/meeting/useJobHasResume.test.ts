import { expect, it, vi } from 'vitest'
import { jobHasResume, loadJobHasResume } from './useJobHasResume'

const saved = { name: 'Resume', text: 'Camunda' }
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

it('reads the selected job and reports availability only for that job', async () => {
  const setKnown = vi.fn()
  loadJobHasResume(7, true, async () => saved, setKnown)
  await flush()
  expect(setKnown).toHaveBeenLastCalledWith({ jobId: 7, has: true })
  expect(jobHasResume({ jobId: 7, has: true }, 7)).toBe(true)
  // switching jobs: the old answer no longer counts until the new job is read
  expect(jobHasResume({ jobId: 7, has: true }, 9)).toBe(false)
  expect(jobHasResume({ jobId: 7, has: true }, '')).toBe(false)
})

it('never reads for Unsorted or while hidden, and re-reads the same job on show', async () => {
  const getResume = vi.fn(async () => null)
  const setKnown = vi.fn()
  expect(loadJobHasResume('', true, getResume, setKnown)).toBeUndefined()
  expect(loadJobHasResume(7, false, getResume, setKnown)).toBeUndefined()
  expect(getResume).not.toHaveBeenCalled()
  loadJobHasResume(7, true, getResume, setKnown)
  await flush()
  expect(getResume).toHaveBeenCalledWith(7)
  expect(setKnown).toHaveBeenLastCalledWith({ jobId: 7, has: false })
})

it('discards a late reply after the selection changed or the page unmounted', async () => {
  let resolve!: (value: unknown) => void
  const setKnown = vi.fn()
  const cleanup = loadJobHasResume(7, true, () => new Promise((done) => (resolve = done)), setKnown)
  cleanup?.()
  resolve(saved)
  await flush()
  expect(setKnown).not.toHaveBeenCalled()
})

it('treats a failed read as no resume', async () => {
  const setKnown = vi.fn()
  loadJobHasResume(7, true, () => Promise.reject(new Error('gone')), setKnown)
  await flush()
  expect(setKnown).toHaveBeenLastCalledWith({ jobId: 7, has: false })
})
