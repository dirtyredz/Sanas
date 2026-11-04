import type { Job } from '@shared/types'
import { rememberedJob } from './start-selection'

/** Name of the bucket row main keeps for meetings started with no job (ensureDefaultJob). */
export const UNSORTED_NAME = 'Unsorted'

/**
 * Jobs a start picker offers as real choices. The Unsorted bucket row is excluded: the
 * picker's own blank "Unsorted" option already means it (main files that meeting into the
 * bucket), so listing the row too showed "Unsorted" twice.
 */
export function startableJobs<T extends Pick<Job, 'name'>>(all: readonly T[]): T[] {
  return all.filter((job) => job.name !== UNSORTED_NAME)
}

/**
 * Applies a freshly loaded job list: the visible choices, and the selection to keep. A
 * remembered or current selection that points at the Unsorted row or a vanished job
 * resolves to '' (Unsorted).
 */
export function applyJobList(
  storage: Parameters<typeof rememberedJob>[0],
  all: readonly Job[],
  newerChoice?: number | '',
): { jobs: Job[]; jobId: number | '' } {
  const jobs = startableJobs(all)
  const jobId = rememberedJob(storage, jobs, newerChoice)
  return { jobs, jobId: jobId !== '' && !jobs.some((j) => j.id === jobId) ? '' : jobId }
}
